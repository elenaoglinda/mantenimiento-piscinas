# Technical Specification — Pool Maintenance & SILOE Reporting App

**Working name:** _AquaControl_ (placeholder)
**Version:** 0.1 (draft for review)
**Date:** 2026-06-24
**Status:** Pre-implementation spec

---

## 1. Purpose & context

A web application for **public-pool operators in Spain** (hotel pools, community pools,
municipal/sports pools, spas, etc.) to record legally-required water-quality maintenance
data and produce the files needed to comply with **Real Decreto 742/2013** (and its update
**RD 3/2023**), notified to the Ministry of Health platform **SILOÉ**.

Two customer types:

1. **Direct owners** — operate their own pool(s).
2. **Maintenance companies** — operate pools on behalf of multiple clients.

The app is the **digital replacement for the paper pool logbook** (_libro de registro /
autocontrol_) plus a generator of the **XML files SILOÉ accepts for bulk upload**.

### 1.1 Decisions locked in (from stakeholder)

- **Platform:** PWA (installable web app, offline-capable). No native app for v1.
- **Auth:** Email/password (+ magic link) for everyone; **Google Workspace SSO** for companies.
- **SILOE XML:** Target the **official SILOÉ XSDs** — both obtained: `piscina` (§5.1) and
  `resultado anual` (§5.2 + Appendix A). Manual upload only in v1; direct upload is future.
- **Billing:** Out of scope for v1.
- **Language:** Spanish (es-ES) only for v1; architecture is i18n-ready.
- **Signature:** on-screen drawn signature + name/DNI + GPS + timestamp is **accepted as
  legally sufficient** (no eIDAS qualified signature in v1).
- **Per-CCAA thresholds:** launch with **Cataluña** only; data-driven for adding more.
- **Lab data:** manual entry + PDF attachment in v1 (no structured lab feed).
- **Multiple bathing seasons/year per basin:** supported (SILOE `peraperturas`).
- **Mapping/routing:** **Mapbox** (geocoding + Optimization API).
- **Notifications:** in-app + email in v1; push later.
- **Theming:** all colors via **design tokens** (aqua/teal primary + semantic
  green/amber/red) so the palette can be swapped later without code changes.

---

## 2. How SILOÉ actually works (the part that drives the design)

This is the most important finding and the reason the data model looks the way it does.

SILOÉ is a Ministry of Health web application accessed by _notificadores_ (pool managers)
authenticated with a **digital certificate (FNMT)**. It accepts data either via on-screen
forms **or via XML file upload** validated against published **XSD** schemas.

There are **two distinct XML upload entities**:

| Entity                              | What it carries                                                                                                          | Cadence                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| **Piscina** (installation)          | Manager, installation, basins (_vasos_), treatments                                                                      | Once at registration + on change               |
| **Resultado anual** (annual result) | Per-basin, per-parameter **aggregated season summary**: nº samplings, nº compliant, average, max, min, days-out-of-range | Annually, **deadline 30 April** for prior year |

> **Key consequence:** SILOÉ does **not** ingest individual daily readings. It ingests an
> **annual aggregate**. Therefore our app must (a) capture daily/per-visit measurement events
> as the working logbook, and (b) **aggregate them per bathing season into the SILOE annual
> result format** for export. Both the per-event log and the aggregate are first-class in our
> data model.

### 2.1 SILOÉ identifiers & catalogs we must respect

SILOÉ assigns/uses internal codes that our XML must echo:

- `cod_p` — installation security code (returned by SILOÉ after acceptance; required for any later op).
- `cod_v`, `cod_v_p`, `cod_v_ccaa` — basin codes.
- `cod_ccaa` — regional code.
- Master-data catalog IDs we must map to SILOÉ's lists: `id_localidad`, `id_isla`,
  `id_tipo` (pool type), `id_clase` (basin class), `tipo_vaso` IDs, `id_sistema`,
  `id_sustancia`, `id_dosificacion`, `id_procedencia_agua`, `id_disposicion`.
- **Dates** use Spanish format `dd/mm/yyyy` (`spanish_date` pattern in the XSD).
- **Coordinates** are decimal degrees, datum **ETRS89** (peninsula) / **WGS-84** (Canarias),
  up to 2 integer + 10 decimal digits, sign allowed.
- `accion` on each `piscina` element drives create/modify/delete.

> **Dependency / open item:** the numeric catalog values (substances, systems, localities,
> islands, etc.) are defined in the SILOÉ companion doc _“Anexo Carga xml piscinas”_ and the
> annual-results XML help doc. We must obtain these to populate our reference tables. Until
> then we model them as lookup tables seeded from those documents. See §13.

---

## 3. Regulatory parameters & acceptable ranges (RD 742/2013)

These drive the **input forms** and the **red / amber / green** status indicator. Ranges
**vary by Comunidad Autónoma**, so they are **data-driven and configurable**, never hardcoded.

### 3.1 In-situ water parameters (measured per visit / daily)

| Parameter                  | Green (compliant)          | Amber (warning)                | Red (closure / non-conformant) | Unit |
| -------------------------- | -------------------------- | ------------------------------ | ------------------------------ | ---- |
| pH                         | 7.2 – 8.0                  | Langelier −0.5…+0.5 if outside | < 6.0 or > 9.0 → close basin   | —    |
| Free residual chlorine     | 0.5 – 1.5 (≤2.0 some CCAA) | near bounds                    | 0 / grossly out                | mg/L |
| Combined chlorine          | ≤ 0.6                      | 0.6–1.0                        | > 1.0                          | mg/L |
| Total bromine (if used)    | 2 – 5                      | near bounds                    | out                            | mg/L |
| Isocyanuric acid           | ≤ 75                       | 75–100                         | > 100                          | mg/L |
| Redox potential            | 250 – 900                  | near bounds                    | out                            | mV   |
| Turbidity                  | < 5                        | —                              | bottom not visible             | NTU  |
| Water temperature (heated) | 24 – 30                    | —                              | > 40 → close                   | °C   |

### 3.2 Lab parameters (monthly / periodic)

| Parameter                                | Compliant | Unit    |
| ---------------------------------------- | --------- | ------- |
| _Escherichia coli_                       | 0         | /100 mL |
| _Pseudomonas aeruginosa_                 | 0         | /100 mL |
| _Legionella spp._ (where aerosolization) | < 100     | CFU/L   |

### 3.3 Air parameters (covered/indoor pools)

| Parameter         | Compliant   | Unit |
| ----------------- | ----------- | ---- |
| Relative humidity | < 65        | %    |
| CO₂               | ≤ 500       | ppm  |
| Air temperature   | water +1…+2 | °C   |

> The amber band is a **UX safety margin** (configurable, default = within X% of a limit),
> not a legal category. Legal states are **conforme / no conforme**; a no-conforme reading
> increments “días de incumplimiento” in the annual aggregate.

---

## 4. Users, roles & tenancy

### 4.1 Account types (chosen at sign-up)

- **Owner** — manages own pools only.
- **Company** — manages pools for many clients.

### 4.2 Tenancy model

Single multi-tenant Supabase Postgres. Top-level isolation unit = **organization**
(`org`). An Owner account is an org with one (implicit) client = itself. A Company account
is an org with many clients. **All row-level security keys off `org_id`.**

### 4.3 Roles (within an org)

| Role                  | Capabilities                                                      |
| --------------------- | ----------------------------------------------------------------- |
| **Owner/Admin**       | Full: manage clients, pools, users, billing (later), generate XML |
| **Technician**        | Field work: create/edit reports, capture signatures, plan routes  |
| **Viewer** (optional) | Read-only dashboards/exports                                      |

Direct-owner accounts effectively only use Admin.

---

## 5. SILOÉ XML export — the integration contract

### 5.1 Pool registration XML (`piscina`)

Generated from our Pool/Basin/Treatment records. Structure (from the official XSD):

```
piscinas
 └─ piscina (maxOccurs unbounded)
     ├─ accion                      (alta | modificacion | baja)
     ├─ instalacion
     │   ├─ cod_p (nillable)        ← SILOE security code, null on first alta
     │   ├─ cod_ccaa, titular, cif_titular, propietario
     │   ├─ notificador, nif_n, email, telefono
     │   ├─ id_localidad, id_isla, direccion, cp, denominacion_p
     │   ├─ longitud, latitud       (decimal degrees)
     │   ├─ id_tipo, num_vasos, observaciones
     │   └─ instalacion_procedencia_agua → id_procedencia_agua[]
     ├─ vasos
     │   └─ vaso[]  (cod_v, cod_v_p, cod_v_ccaa, denominacion, id_clase,
     │               tipo_vaso[], capacidad, lamina, profundidad_max/min,
     │               observaciones, fecha_baja)
     └─ tratamientos
         └─ tratamiento[] (cod_t, vasos_tratam→cod_v_p[], filtracion,
                           desinfeccion[], coagulacion[], correcionpH[],
                           otros[], dosificacion_tratam[])
```

### 5.2 Annual-results XML (`resultado anual`)

Generated by **aggregating our per-visit measurement events** per basin per season.
Header fields per basin/season:

- `vaso`, `tipo de análisis` (Autocontrol | Vigilancia Sanitaria)
- `fecha_apertura`, `fecha_cierre` (same calendar year), `nº días apertura`
- `nº controles iniciales / rutina / periódicos`, `punto de muestreo`
  (en el vaso | en el circuito | cada uno | ambos)

Per parameter:

- `método`, `lugar` (in situ | laboratorio)
- `nº muestreos realizados`, `nº muestreos conformes`
- `valor medio`, `valor máximo`, `valor mínimo` (1–2 decimals, dot separator)
- `días de incumplimiento`

**Aggregation rule (from the manual):** if multiple readings of one parameter occur on the
same day, average them to a daily value first, then compute the season mean from daily values.

> **The annual-results XSD and all its catalog codes are now obtained** (from
> _Anexo_CargaXML_Result_Anual v1.4_). Full schema, code tables and SILOE-side validation
> rules are in **Appendix A**. The exporter is built against an internal canonical model with
> a thin mapping layer to these tag names / numeric IDs.

### 5.3 Export module design

- `xmlBuilder` service (Node) producing XSD-valid output; validate against the XSD with
  `libxmljs`/`xsd-schema-validator` before download.
- Spanish date + decimal formatting helpers.
- Catalog-mapping layer translating our internal enums → SILOÉ numeric IDs.
- v1 delivers a **downloadable file** for manual upload to SILOÉ. (Direct API upload is
  **not** in v1 — SILOÉ access requires FNMT digital certificate + per-CCAA accounts.)

---

## 6. Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Client: React PWA (Vite + TypeScript)                       │
│   - Service Worker (Workbox) for offline shell + sync        │
│   - IndexedDB (Dexie) offline store + outbox queue           │
│   - UI: component lib (see §12), i18n (es-ES)                 │
│   - Map/routing SDK (Mapbox GL or Google Maps)               │
└───────────────┬───────────────────────────┬─────────────────┘
                │ Supabase JS (REST/Realtime) │ HTTPS
                ▼                             ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│  Supabase (EU region)     │   │  Node API (Vercel functions) │
│   - Postgres + RLS        │   │   - XML generation/validate  │
│   - Auth (email, Google)  │   │   - Route optimization proxy │
│   - Storage (signatures,  │   │   - Geocoding proxy          │
│     lab PDFs, photos)     │   │   - PDF report rendering     │
│   - Edge Functions (opt.) │   │   (server-only API keys)     │
└──────────────────────────┘   └─────────────────────────────┘
```

- **Frontend:** React + TypeScript + Vite, deployed on **Vercel**.
- **Backend:** Primarily Supabase (Postgres, Auth, Storage, RLS). A thin **Node layer as
  Vercel serverless functions** for: XML build/validation, geocoding & route optimization
  (keeps third-party keys server-side), and PDF generation. Heavy/long jobs can move to
  Supabase Edge Functions if needed.
- **Why this split:** most CRUD goes directly client→Supabase with RLS (fast, less code);
  only secret-bearing or compute tasks hit the Node functions.

---

## 7. Data model (Postgres, all tenant tables carry `org_id`)

```
org(id, type[owner|company], name, created_at)
app_user(id=auth.uid, org_id, role, full_name, email, dni_nif)

client(id, org_id, name, cif_nif, contact_email, contact_phone, notes)
  -- for owner orgs: a single self-client

pool(id, org_id, client_id,
     denominacion, pool_type,            -- id_tipo (1|2|3A)
     ccaa, provincia, municipio, localidad, cp, direccion,
     lat, lng,                           -- decimal degrees
     agua_alimentacion[],                -- procedencia agua
     siloe_cod_p, siloe_cod_ccaa,        -- SILOE identifiers
     num_vasos, observaciones, status)

basin(id, pool_id, org_id,
      num_orden, denominacion, clase[cubierto|descubierto|mixto],
      tipo_vaso[], capacidad_m3, lamina_m2, prof_max, prof_min,
      siloe_cod_v, siloe_cod_v_p, observaciones, fecha_baja)

treatment(id, basin_id, org_id, type, sistemas[], sustancias[],
          comercial, dosificacion, observaciones)   -- filtración/desinfección/etc.

parameter_def(id, code, name_es, unit, applies_to[water|air|lab],
              ccaa,                       -- null = national default
              min_ok, max_ok, min_warn, max_warn,
              closure_min, closure_max, frequency, active)
  -- data-driven thresholds; CCAA overrides national row

report(id, org_id, pool_id, basin_id, technician_id,
       visited_at, status[draft|completed|signed],
       analysis_type[autocontrol|vigilancia], punto_muestreo,
       location_lat, location_lng,        -- captured GPS at visit
       notes, signed_at, signed_by_name, signed_by_dni,
       signature_storage_path, client_offline_id, synced_at)

measurement(id, report_id, org_id, parameter_def_id,
            value, method, lugar[in_situ|lab], compliant[bool],
            status[green|amber|red])

incident(id, report_id, org_id, description, corrective_action, closed_at)

attachment(id, report_id, org_id, kind[photo|lab_pdf], storage_path)

annual_result(id, org_id, basin_id, year, analysis_type,
              fecha_apertura, fecha_cierre, dias_apertura,
              n_controles_iniciales, n_rutina, n_periodicos,
              punto_muestreo, generated_from, status)
annual_result_param(id, annual_result_id, parameter_def_id,
                    metodo, lugar, n_muestreos, n_conformes,
                    valor_medio, valor_max, valor_min, dias_incumplimiento)
  -- materialized from `measurement` aggregation; editable before export

route(id, org_id, technician_id, date, optimized_order[], distance, duration)
route_stop(id, route_id, pool_id, seq, eta)

siloe_catalog(id, kind, siloe_id, label_es, parent_id)  -- mapping tables

xml_export(id, org_id, kind[piscina|resultado_anual], period,
           file_storage_path, created_by, created_at)
```

**RLS:** every tenant table has `USING (org_id = auth.jwt() -> org_id)` policies for
select/insert/update/delete, with role checks layered on (e.g. only Admin manages users).

---

## 8. Offline strategy (field requirement)

- **App shell** precached by Workbox; works with no connectivity.
- **Local DB:** Dexie/IndexedDB mirrors the data a technician needs for the day
  (assigned pools, basins, parameter defs, route).
- **Write path:** reports/measurements/signatures written locally first, queued in an
  **outbox**, and synced to Supabase when online.
- **Sync & conflict policy:** each report has a stable client-generated UUID
  (`client_offline_id`) → idempotent upsert. Reports are append-mostly; last-write-wins per
  field with `updated_at`, and a **signed report is immutable** (no further edits, only a new
  corrective report). Photos/signatures uploaded to Storage on reconnect.
- **Visibility:** clear per-record sync status (pending / synced / error) in the UI.

---

## 9. Key feature flows

### 9.1 Record a maintenance report

1. Technician selects pool → basin.
2. Form renders **only the parameters configured** for that basin/CCAA, each with live
   **green/amber/red** feedback as values are typed.
3. Add incidents/corrective actions, photos, lab PDF if applicable.
4. Save as **draft** (resumable) or mark **completed**.

### 9.2 Signature & status lifecycle

`draft → completed → signed`

- **draft:** editable, partial allowed.
- **completed:** all required fields present; ready for signature.
- **signed:** owner/representative signs **on-screen** (drawn signature) with name + DNI/NIF;
  app stores signature image + timestamp + GPS. **Signed reports become immutable.**
- (eIDAS qualified e-signature is _not_ in v1; on-screen capture + identity metadata is the
  evidentiary model. Flagged as an open question — see §13.)

### 9.3 Route planning

- Technician selects multiple pools for a day.
- Node function geocodes addresses (cached) and calls a routing/optimization API
  (Mapbox Optimization API or Google Directions with waypoint optimization) starting from
  the technician's start location.
- Returns ordered stops + map + ETAs; available offline once fetched.

### 9.4 Annual aggregation & XML export

- On demand (or scheduled near the **30 April** deadline), the system aggregates
  `measurement` rows per basin/season into `annual_result(_param)` using the SILOE
  aggregation rules (§5.2), lets the admin review/adjust, then **generates & validates the
  XML** and stores it for download.
- Pool-registration XML is generated from pool/basin/treatment records on demand.

---

## 10. Validation & status logic

- A single `evaluate(value, parameter_def)` function returns
  `{ status: green|amber|red, compliant: bool }` used identically in the form, dashboards,
  and aggregation.
- Compliance (`compliant`) follows the **legal** range; status color adds the amber UX band.
- `dias_incumplimiento` counts distinct days with ≥1 non-conformant daily value.

---

## 11. Security, privacy & compliance

- **GDPR:** Supabase project in an **EU region**; signatures, DNI/NIF and personal contact
  data are personal data → access-controlled via RLS, encrypted at rest (Supabase default),
  TLS in transit. Data-retention & deletion policy defined per client. DPA with Supabase/Vercel.
- **Auth:** Supabase Auth; Google Workspace OIDC for companies; email/password + magic link.
  Strong password policy, email verification.
- **Secrets:** third-party keys (maps, routing) only in Node functions, never in the client.
- **Audit:** signed reports immutable; `created_by`/`updated_at` on mutable tables; export log.

---

## 12. UX & visual design

- **Tone:** approachable, friendly, **not** “technical/industrial”. Clean, lots of
  whitespace, large tap targets (field use on phones), generous use of the traffic-light
  status colors as the core visual language.
- **Component approach:** a small design system on top of a headless lib (e.g. Radix +
  Tailwind, or shadcn/ui) for speed + accessibility (WCAG AA).
- **Color scheme:** TBD — propose a calm aqua/teal primary with clear semantic
  green/amber/red. To be confirmed in a design pass.
- **Mobile-first** layouts; installable PWA with home-screen icon & splash.
- All copy in Spanish; strings externalized (i18n) from day one.

---

## 13. Open questions & dependencies

All major decisions are resolved (see §1.1). Remaining items are confirmations/data tasks,
none blocking the build start:

1. **`piscina` registration catalogs** — the _“Anexo Carga xml piscinas”_ numeric catalogs
   (localidades, islas, substances, systems, dosificación, etc.) for the **pool-registration**
   XML are still to be obtained. The **annual-results** catalogs are fully in hand (Appendix A).
   Registration-XML mapping is the only piece gated on this; the annual-results path (the
   primary deadline-driven flow) is unblocked.
2. **Laboratory codes** — annual-results XML requires a SILOE `laboratorio` code. We need the
   lab-code catalog/lookup (or per-pool configured value) from SILOE.
3. **Cataluña-specific thresholds** — confirm the exact Catalan parametric values/frequencies
   to seed `parameter_def` (we seed RD 742/2013 national defaults + Catalan overrides).

---

## 14. Proposed v1 scope vs later

**v1 (MVP):**

- Sign-up (owner/company), auth (email + Google SSO), org/roles.
- Manage clients, pools (with addresses/geo), basins, treatments.
- Record reports with all RD 742/2013 parameters + traffic-light validation.
- Draft → completed → signed (on-screen signature), offline-capable.
- Annual aggregation + **SILOE XML export (download)** for pool + annual results.
- Route planning.
- Spanish UI, EU data residency.

**Later:**

- Billing/subscriptions (Stripe).
- Direct SILOÉ upload via API/certificate.
- Native app wrapper, push notifications.
- Multi-language, advanced analytics/benchmarking, scheduled report reminders.

---

## 15. Suggested milestones

1. **Foundations** — repo, Supabase schema + RLS, auth (email + Google), org/roles, i18n shell.
2. **Core domain** — clients, pools, basins, treatments CRUD; parameter-def seeding.
3. **Reporting** — report form + traffic-light engine + draft/complete + signature; offline + sync.
4. **SILOE export** — aggregation engine + XML builders + XSD validation (gated on §13.1 docs).
5. **Routing** — geocoding + optimization + map UI.
6. **Polish** — design system pass, dashboards, accessibility, PWA install, QA.

---

## Appendix A — Annual-results XML contract (SILOE `resultado anual`)

Source: _Anexo_CargaXML_Result_Anual v1.4_ (2022-04-08). This is the deadline-driven export.

### A.1 Structure (XSD)

```
muestreos
 └─ muestreo[1..n]
     ├─ cod_seguridad   (string, req)   pool security code from SILOE
     ├─ annio           (string, req)   year — must be the year *prior* to current
     ├─ observaciones   (string, opt)
     ├─ laboratorio     (string, req)   SILOE lab code (see §13.2)
     └─ mvasos
         └─ mvaso[1..n]
             ├─ cod_v            (long, req)        basin code
             ├─ c_inicial_v      (long, ≤20)        nº initial controls
             ├─ c_rutina_v       (long, ≤1500)      nº routine controls
             ├─ c_periodico_v    (long, ≤20)        nº periodic controls
             ├─ c_vigilancia_v   (long, opt)        nº surveillance controls
             ├─ id_pm            (long, req)        TIPO_PM
             ├─ id_tipo_analisis (long, req)        TIPO_ANALISIS
             ├─ fecha_a          (dd/mm/yyyy, req)  season open
             ├─ fecha_c          (dd/mm/yyyy, req)  season close
             ├─ numdiasAp        (long, req)        days open (≤365)
             ├─ peraperturas     (opt)              multiple open/close periods
             │   └─ perapertura[1..n]
             │       ├─ per_fecha_a (dd/mm/yyyy)  per_fecha_c (dd/mm/yyyy)
             │       ├─ per_num_dias (long)
             │       ├─ per_observCierre (string, req if motivo=Otros)
             │       └─ per_id_motivo (long → MOTIVO_CIERRE)
             └─ parametros
                 └─ parametro[1..n]
                     ├─ id_parametro (long → PARAMETROS)
                     ├─ dias_nc      (long)   days non-conformant (≤ numdiasAp)
                     ├─ deter        (long)   nº determinations
                     ├─ deter_c      (long)   nº compliant (≤ deter)
                     ├─ idLugar      (long → LUGAR)
                     ├─ idMetodo     (long → METODO)
                     ├─ vc_med, vc_min, vc_max  (decimal, "###.##"; vc_max > vc_min)
```

`accion` is always `A` (alta). Numbers use up to 7 integer + 2 decimal digits, `.` or `,`
separator (`sample_comma`).

### A.2 Catalog codes (seed `siloe_catalog`)

- **TIPO_PM:** 1 En el circuito · 2 En el vaso · 3 Ambos · 4 Cada vez uno de ellos
- **TIPO_ANALISIS:** 1 Autocontrol · 2 Vigilancia sanitaria
- **LUGAR:** 1 In situ · 2 Laboratorio
- **MOTIVO_CIERRE:** 1 Vacaciones · 2 Autoridad Sanitaria · 3 Obras · 4 Avería ·
  5 Accidente · 6 Otros · 7 COVID-19
- **METODO:** 1 Potenciometría · 2 Kit · 3 Contadores · 4 Visual · 5 Nefelométrico ·
  6 Espectrofotometría UV/VIS · 7 Volumetría · 8 Número más probable · 9 Cultivo ·
  10 Fotometría · 11 Sustrato definido · 12 Filtración membrana · 13 PCR · 14 Otros ·
  15 Cromatografía
- **PARAMETROS** (id · name · unit): water-mandatory **1** pH · **2** Redox (mV) ·
  **3** Temp. agua (°C) · **4** Tiempo recirculación (h) · **5** Transparencia ·
  **6** Turbidez (UNF) · **7** Ácido isocianúrico (mg/L) · **8** Bromo total (mg/L) ·
  **9** Cloro combinado (mg/L) · **10** Cloro libre (mg/L) · **11** E. coli (UFC/100ml) ·
  **12** Legionella (UFC/L) · **13** P. aeruginosa (UFC/100ml); air-mandatory **14** CO₂ ·
  **15** Humedad relativa · **16** Temp. ambiente; water-optional **105–130**
  (Aluminio, Cobre, Hierro, Nitratos, Nitritos, Plata, Plomo, Amoniaco, Conductividad,
  Tensioactivas, Espumas/grasas, Langelier, Olor, Color, Biguanidas, Hidantoína, Ozono,
  aerobias 22°/37°, coliformes, enterococos, protozoos, Salmonella, S. aureus, estreptococos);
  air-optional **131** Trihalometanos · **132** Cloraminas.
  Each parameter restricts valid LUGAR + METODO combinations (enforce client-side; SILOE
  rejects with errors 239–241 otherwise).

### A.3 SILOE-side validation (mirror client-side before export)

Key rules to pre-validate so exports don't bounce: `deter_c ≤ deter` (236);
`dias_nc ≤ numdiasAp` (237); `vc_max > vc_min` (206); `numdiasAp ≤ 365` (208);
`fecha_c ≥ fecha_a` (004) and **same year** (209); year = prior year only (201, 210);
no duplicate (vaso, periodo, tipo análisis) (202/203); vc_med/min/max required (228–230);
if `peraperturas` used, sum of period days must reconcile with `numdiasAp`/dates (290–293);
Vigilancia analyses can't carry inicial/rutina/periódico values (214–220). Full error list
(`COD_ERROR_001…293`) is captured for surfacing import responses. Response XML may append
`<ERRORES><ERROR><CodError/><MensajeError/><ParamFilaError/></ERROR></ERRORES>`.
