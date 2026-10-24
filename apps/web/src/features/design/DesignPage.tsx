import { useEffect, useState, type ReactNode } from 'react';
import {
  CalendarCheck,
  ClipboardList,
  FileUp,
  Plus,
  ShieldCheck,
  TriangleAlert,
  Waves,
} from 'lucide-react';
import { Logo } from '../../components/brand/Logo.js';
import { Avatar } from '../../components/ui/Avatar.js';
import { Breadcrumb } from '../../components/ui/Breadcrumb.js';
import { Button } from '../../components/ui/Button.js';
import { Card, CardHeader } from '../../components/ui/Card.js';
import { Combobox } from '../../components/ui/Combobox.js';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../../components/ui/Command.js';
import { DataTable, TableToolbar, type Column } from '../../components/ui/DataTable.js';
import { DatePicker } from '../../components/ui/DatePicker.js';
import { Dialog, Sheet } from '../../components/ui/Dialog.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { Alert } from '../../components/ui/feedback.js';
import { Field, Input, NativeSelect, Textarea } from '../../components/ui/Input.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { ParamChip } from '../../components/ui/ParamChip.js';
import { ProgressBar } from '../../components/ui/ProgressBar.js';
import { Select } from '../../components/ui/Select.js';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton.js';
import { StatCard } from '../../components/ui/StatCard.js';
import { StatusPill } from '../../components/ui/StatusPill.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/Tabs.js';
import { toast } from '../../components/ui/toast.js';
import { Tooltip } from '../../components/ui/Tooltip.js';

/**
 * Internal gallery of every token and component, with sample data. Not linked from the app;
 * see README for where it is available.
 */

const SWATCHES: { group: string; tokens: string[] }[] = [
  {
    group: 'Aqua (brand)',
    tokens: [
      'brand-50',
      'brand-100',
      'brand-200',
      'brand-300',
      'brand-400',
      'brand-500',
      'brand-600',
      'brand-700',
      'brand-800',
      'brand-900',
    ],
  },
  { group: 'Navy', tokens: ['navy-700', 'navy-800', 'navy-900'] },
  {
    group: 'Roles',
    tokens: [
      'primary',
      'accent',
      'accent-soft',
      'focus-ring',
      'bg',
      'surface',
      'surface-muted',
      'sidebar-bg',
      'text',
      'text-muted',
      'border',
    ],
  },
  {
    group: 'Estado',
    tokens: [
      'status-green',
      'status-green-bg',
      'status-green-text',
      'status-amber',
      'status-amber-bg',
      'status-amber-text',
      'status-red',
      'status-red-bg',
      'status-red-text',
      'status-unknown',
      'status-unknown-bg',
      'status-unknown-text',
    ],
  },
];

interface SamplePool {
  id: string;
  name: string;
  client: string;
  town: string;
  lastVisit: string | null;
  status: 'green' | 'amber' | 'red' | 'unknown';
}

const POOLS: SamplePool[] = [
  {
    id: '1',
    name: 'Villa Mar · Piscina comunitaria',
    client: 'Comunidad Villa Mar',
    town: 'Málaga',
    lastVisit: '2026-10-23',
    status: 'green',
  },
  {
    id: '2',
    name: 'Las Palmeras · Piscina exterior',
    client: 'Hotel Las Palmeras',
    town: 'Marbella',
    lastVisit: '2026-10-21',
    status: 'amber',
  },
  {
    id: '3',
    name: 'Las Palmeras · Spa',
    client: 'Hotel Las Palmeras',
    town: 'Marbella',
    lastVisit: '2026-10-12',
    status: 'red',
  },
  {
    id: '4',
    name: 'Residencial Sol',
    client: 'CP Residencial Sol',
    town: 'Fuengirola',
    lastVisit: null,
    status: 'unknown',
  },
];

const STATUS_LABEL = {
  green: 'En rango',
  amber: 'Vigilar',
  red: 'Fuera de rango',
  unknown: 'Sin datos',
} as const;

const dateFmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });

const columns: Column<SamplePool>[] = [
  { id: 'name', header: 'Piscina', cell: (p) => p.name, sortValue: (p) => p.name },
  {
    id: 'client',
    header: 'Cliente',
    cell: (p) => p.client,
    sortValue: (p) => p.client,
    hideBelow: 'md',
  },
  {
    id: 'town',
    header: 'Municipio',
    cell: (p) => p.town,
    sortValue: (p) => p.town,
    hideBelow: 'lg',
  },
  {
    id: 'last',
    header: 'Última visita',
    cell: (p) =>
      p.lastVisit ? (
        <time dateTime={p.lastVisit}>{dateFmt.format(new Date(p.lastVisit))}</time>
      ) : (
        '—'
      ),
    sortValue: (p) => p.lastVisit,
    align: 'right',
  },
  {
    id: 'status',
    header: 'Estado',
    cell: (p) => <StatusPill tone={p.status}>{STATUS_LABEL[p.status]}</StatusPill>,
  },
];

export function DesignPage() {
  const [select, setSelect] = useState('2026');
  const [combo, setCombo] = useState('');
  const [date, setDate] = useState('2026-10-24');
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [palette, setPalette] = useState(false);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    document.title = 'Cloro · Sistema de diseño';
  }, []);

  const rows = POOLS.filter((p) =>
    `${p.name} ${p.client}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-bg">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-8">
        <Logo size="sm" />
        <span className="text-sm text-text-muted">
          Sistema de diseño · página interna (desarrollo y previews)
        </span>
      </header>

      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:px-8">
        <PageHeader
          title="Componentes"
          description="Cada token y componente de src/components/ui con datos de ejemplo."
          badges={<StatusPill tone="info">Interno</StatusPill>}
          actions={
            <>
              <Button variant="secondary">Secundario</Button>
              <Button>
                <Plus aria-hidden size={16} />
                Acción principal
              </Button>
            </>
          }
        />

        <Section
          title="Colores"
          note="Tokens de src/styles/tokens.css. Todo tono de marca entre 186° y 215°."
        >
          <div className="flex flex-col gap-5">
            {SWATCHES.map((g) => (
              <div key={g.group}>
                <h3 className="mb-2 text-sm font-semibold text-text">{g.group}</h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                  {g.tokens.map((tk) => (
                    <div
                      key={tk}
                      className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface"
                    >
                      <div className="h-12" style={{ background: `var(--${tk})` }} />
                      <p className="px-2 py-1.5 font-mono text-[11px] text-text-muted">--{tk}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Tipografía"
          note="Space Grotesk para títulos y cifras; DM Sans para el resto."
        >
          <div className="flex flex-col gap-3">
            <p className="font-display text-2xl leading-8 font-semibold">Título de página 24/32</p>
            <p className="font-display text-base font-semibold">Título de sección 16/24</p>
            <p className="text-sm">Texto 14/20 — Cloro libre medido en el vaso a las 10:02.</p>
            <p className="text-xs text-text-muted">Meta 12/16 — Actualizado hace 3 minutos</p>
            <p className="font-display text-[28px] leading-9 font-semibold tabular-nums">
              1.284,50 €
            </p>
          </div>
        </Section>

        <Section title="Radios y sombra">
          <div className="flex flex-wrap gap-4">
            {['sm', 'md', 'lg', 'full'].map((r) => (
              <div
                key={r}
                className="flex size-20 items-center justify-center border border-border bg-surface text-xs text-text-muted shadow-card"
                style={{ borderRadius: `var(--radius-${r})` }}
              >
                {r}
              </div>
            ))}
          </div>
        </Section>

        <Section title="Botones">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primario</Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="danger">Anular factura</Button>
            <Button variant="link">Enlace</Button>
            <Button loading>Guardando…</Button>
            <Button disabled>Deshabilitado</Button>
            <Button size="sm">Pequeño</Button>
            <Button size="lg">Grande</Button>
            <Tooltip content="Importar parte">
              <Button variant="secondary" size="icon" aria-label="Importar parte">
                <FileUp aria-hidden size={16} />
              </Button>
            </Tooltip>
          </div>
        </Section>

        <Section title="Formularios">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de la piscina" hint="Como la reconoce el técnico.">
              <Input placeholder="Villa Mar · Piscina comunitaria" />
            </Field>
            <Field label="NIF / CIF" error="El NIF no es válido.">
              <Input defaultValue="B1234" />
            </Field>
            <Field label="Tipo de análisis (nativo)">
              <NativeSelect defaultValue="auto">
                <option value="auto">Autocontrol</option>
                <option value="ext">Control externo</option>
              </NativeSelect>
            </Field>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="design-year" className="text-sm font-medium text-text">
                Año (Select)
              </label>
              <Select
                id="design-year"
                value={select}
                onValueChange={setSelect}
                options={['2024', '2025', '2026'].map((y) => ({ value: y, label: y }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="design-pool" className="text-sm font-medium text-text">
                Piscina (Combobox)
              </label>
              <Combobox
                id="design-pool"
                value={combo}
                onValueChange={setCombo}
                options={POOLS.map((p) => ({ value: p.id, label: p.name, detail: p.client }))}
                placeholder="Selecciona una piscina"
                searchPlaceholder="Buscar piscina o cliente…"
                emptyText="Ninguna piscina coincide."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="design-date" className="text-sm font-medium text-text">
                Fecha (DatePicker)
              </label>
              <DatePicker
                id="design-date"
                value={date}
                onValueChange={setDate}
                placeholder="Elige una fecha"
              />
            </div>
            <Field label="Notas" className="sm:col-span-2">
              <Textarea placeholder="Observaciones de la visita" />
            </Field>
          </div>
        </Section>

        <Section title="Tarjetas y KPIs">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Piscinas activas"
              value="24"
              hint="3 sin visita este mes"
              icon={<Waves size={16} />}
            />
            <StatCard
              label="Visitas hoy"
              value="6"
              hint="2 completadas"
              icon={<CalendarCheck size={16} />}
            />
            <StatCard
              label="Lecturas fuera de rango"
              value="2"
              tone="alert"
              hint="Últimos 7 días"
              icon={<TriangleAlert size={16} />}
            />
            <StatCard label="SILOÉ 2026" value="8 / 12" icon={<ShieldCheck size={16} />}>
              <ProgressBar value={8} max={12} label="Piscinas listas para SILOÉ" />
            </StatCard>
            <StatCard label="Cargando" value="—" loading />
          </div>
          <Card className="mt-4">
            <CardHeader
              title="Tarjeta con cabecera"
              description="Descripción breve."
              actions={
                <Button size="sm" variant="secondary">
                  Ver todo
                </Button>
              }
            />
            <SkeletonText />
          </Card>
        </Section>

        <Section title="Estado">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill tone="green">En rango</StatusPill>
            <StatusPill tone="amber">Vigilar</StatusPill>
            <StatusPill tone="red">Fuera de rango</StatusPill>
            <StatusPill tone="unknown">Sin datos</StatusPill>
            <StatusPill tone="info">Borrador</StatusPill>
            <StatusPill tone="neutral" dot={false}>
              Archivada
            </StatusPill>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <ParamChip
              label="Cl libre"
              value="1,2"
              unit="ppm"
              status="green"
              title="Rango 0,5–2,0 ppm"
            />
            <ParamChip label="pH" value="7,9" status="amber" title="Rango 7,2–8,0" />
            <ParamChip
              label="Cl combinado"
              value="0,9"
              unit="ppm"
              status="red"
              title="Máximo 0,6 ppm"
            />
            <ParamChip label="Turbidez" value={null} unit="UNF" />
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Alert tone="info">Entorno de pruebas: las facturas no se envían a la AEAT real.</Alert>
            <Alert tone="success">Informe guardado.</Alert>
            <Alert tone="warning">Faltan 4 piscinas por revisar antes de exportar.</Alert>
            <Alert tone="error">No se pudo conectar. Inténtalo de nuevo.</Alert>
          </div>
        </Section>

        <Section title="Tabla">
          <TableToolbar
            search={query}
            onSearch={setQuery}
            searchPlaceholder="Buscar piscina o cliente"
            actions={
              <Button variant="secondary" size="sm" onClick={() => setLoading((l) => !l)}>
                {loading ? 'Mostrar datos' : 'Simular carga'}
              </Button>
            }
          />
          <DataTable
            caption="Piscinas de ejemplo"
            columns={columns}
            rows={rows}
            getRowId={(p) => p.id}
            loading={loading}
            initialSort={{ id: 'name', dir: 'asc' }}
            empty={
              <EmptyState
                compact
                icon={<Waves size={20} />}
                title="Ninguna piscina coincide"
                description="Prueba con otro nombre o cliente."
              />
            }
          />
        </Section>

        <Section title="Estado vacío">
          <Card padded={false}>
            <EmptyState
              icon={<ClipboardList size={22} />}
              title="Todavía no hay informes"
              description="Registra la primera visita o importa un parte en PDF o foto."
              action={
                <Button>
                  <Plus aria-hidden size={16} />
                  Nuevo informe
                </Button>
              }
            />
          </Card>
        </Section>

        <Section title="Pestañas, migas y avatar">
          <Tabs defaultValue="resumen">
            <TabsList>
              <TabsTrigger value="resumen">Resumen</TabsTrigger>
              <TabsTrigger value="vasos">Vasos</TabsTrigger>
              <TabsTrigger value="informes">Informes</TabsTrigger>
              <TabsTrigger value="siloe" disabled>
                SILOÉ
              </TabsTrigger>
            </TabsList>
            <TabsContent value="resumen">Contenido de Resumen.</TabsContent>
            <TabsContent value="vasos">Contenido de Vasos.</TabsContent>
            <TabsContent value="informes">Contenido de Informes.</TabsContent>
          </Tabs>
          <div className="mt-6 flex flex-wrap items-center gap-6">
            <Breadcrumb
              label="Ejemplo de migas"
              collapseOnMobile={false}
              items={[
                { label: 'Operación' },
                { label: 'Piscinas', to: '/design' },
                { label: 'Villa Mar' },
              ]}
            />
            <div className="flex items-center gap-2">
              <Avatar name="Elena Oglinda" size="sm" />
              <Avatar name="Sara Bon" />
              <Avatar name="Técnico" size="lg" />
            </div>
          </div>
        </Section>

        <Section title="Superposiciones">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setDialog(true)}>
              Abrir diálogo
            </Button>
            <Button variant="secondary" onClick={() => setSheet(true)}>
              Abrir panel lateral
            </Button>
            <Button variant="secondary" onClick={() => setPalette(true)}>
              Abrir paleta ⌘K
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast('Piscina creada', { description: 'Villa Mar ya aparece en la lista.' })
              }
            >
              Toast de éxito
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast('No se pudo guardar', { tone: 'error', description: 'Revisa la conexión.' })
              }
            >
              Toast de error
            </Button>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
        </Section>
      </main>

      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="¿Emitir la factura?"
        description="Se enviará a la AEAT y no se podrá editar."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setDialog(false)}>Emitir</Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">Factura F2026-0042 · 242,00 €</p>
      </Dialog>

      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Nueva piscina"
        description="Los datos que pide SILOÉ."
        footer={
          <>
            <Button variant="secondary" onClick={() => setSheet(false)}>
              Cancelar
            </Button>
            <Button onClick={() => setSheet(false)}>Guardar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Nombre">
            <Input />
          </Field>
          <Field label="Municipio">
            <Input />
          </Field>
        </div>
      </Sheet>

      <CommandDialog
        open={palette}
        onOpenChange={setPalette}
        label="Ir a una página"
        footer={<span>↑↓ para moverte · Enter para abrir · Esc para cerrar</span>}
      >
        <CommandInput aria-label="Ir a una página" placeholder="Escribe para buscar…" />
        <CommandList>
          <CommandEmpty>Sin resultados.</CommandEmpty>
          <CommandGroup heading="Páginas">
            {['Inicio', 'Piscinas', 'Informes', 'SILOÉ', 'Facturación'].map((p) => (
              <CommandItem key={p} value={p} onSelect={() => setPalette(false)}>
                {p}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-base font-semibold text-text">{title}</h2>
      {note && <p className="mt-0.5 text-sm text-text-muted">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
