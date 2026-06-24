// Generated from the Supabase schema. Do not edit by hand.
// Regenerate with the Supabase MCP `generate_typescript_types` (or
// `supabase gen types typescript --linked`) after each migration, then run `npm run format`.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      app_user: {
        Row: {
          created_at: string;
          dni_nif: string | null;
          email: string | null;
          full_name: string | null;
          id: string;
          org_id: string;
          role: Database['public']['Enums']['user_role'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dni_nif?: string | null;
          email?: string | null;
          full_name?: string | null;
          id: string;
          org_id: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dni_nif?: string | null;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          org_id?: string;
          role?: Database['public']['Enums']['user_role'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'app_user_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'org';
            referencedColumns: ['id'];
          },
        ];
      };
      basin: {
        Row: {
          capacidad_m3: number | null;
          clase: Database['public']['Enums']['basin_class'] | null;
          created_at: string;
          denominacion: string;
          fecha_baja: string | null;
          id: string;
          lamina_m2: number | null;
          num_orden: number | null;
          observaciones: string | null;
          org_id: string;
          pool_id: string;
          prof_max: number | null;
          prof_min: number | null;
          siloe_cod_v: string | null;
          siloe_cod_v_p: string | null;
          tipo_vaso: string[];
          updated_at: string;
        };
        Insert: {
          capacidad_m3?: number | null;
          clase?: Database['public']['Enums']['basin_class'] | null;
          created_at?: string;
          denominacion: string;
          fecha_baja?: string | null;
          id?: string;
          lamina_m2?: number | null;
          num_orden?: number | null;
          observaciones?: string | null;
          org_id: string;
          pool_id: string;
          prof_max?: number | null;
          prof_min?: number | null;
          siloe_cod_v?: string | null;
          siloe_cod_v_p?: string | null;
          tipo_vaso?: string[];
          updated_at?: string;
        };
        Update: {
          capacidad_m3?: number | null;
          clase?: Database['public']['Enums']['basin_class'] | null;
          created_at?: string;
          denominacion?: string;
          fecha_baja?: string | null;
          id?: string;
          lamina_m2?: number | null;
          num_orden?: number | null;
          observaciones?: string | null;
          org_id?: string;
          pool_id?: string;
          prof_max?: number | null;
          prof_min?: number | null;
          siloe_cod_v?: string | null;
          siloe_cod_v_p?: string | null;
          tipo_vaso?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'basin_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'org';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'basin_pool_id_org_id_fkey';
            columns: ['pool_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'pool';
            referencedColumns: ['id', 'org_id'];
          },
        ];
      };
      client: {
        Row: {
          archived: boolean;
          cif_nif: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          created_at: string;
          id: string;
          is_self: boolean;
          name: string;
          notes: string | null;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          archived?: boolean;
          cif_nif?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          is_self?: boolean;
          name: string;
          notes?: string | null;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          archived?: boolean;
          cif_nif?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          id?: string;
          is_self?: boolean;
          name?: string;
          notes?: string | null;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'client_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'org';
            referencedColumns: ['id'];
          },
        ];
      };
      org: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          type: Database['public']['Enums']['org_type'];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          type: Database['public']['Enums']['org_type'];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          type?: Database['public']['Enums']['org_type'];
          updated_at?: string;
        };
        Relationships: [];
      };
      parameter_def: {
        Row: {
          active: boolean;
          ccaa: string | null;
          closure_max: number | null;
          closure_min: number | null;
          created_at: string;
          frequency: string | null;
          id: string;
          mandatory: boolean;
          max_ok: number | null;
          max_warn: number | null;
          medium: Database['public']['Enums']['param_medium'];
          min_ok: number | null;
          min_warn: number | null;
          name_es: string;
          siloe_param_id: number;
          unit: string | null;
          updated_at: string;
          warn_margin_ratio: number;
        };
        Insert: {
          active?: boolean;
          ccaa?: string | null;
          closure_max?: number | null;
          closure_min?: number | null;
          created_at?: string;
          frequency?: string | null;
          id?: string;
          mandatory?: boolean;
          max_ok?: number | null;
          max_warn?: number | null;
          medium?: Database['public']['Enums']['param_medium'];
          min_ok?: number | null;
          min_warn?: number | null;
          name_es: string;
          siloe_param_id: number;
          unit?: string | null;
          updated_at?: string;
          warn_margin_ratio?: number;
        };
        Update: {
          active?: boolean;
          ccaa?: string | null;
          closure_max?: number | null;
          closure_min?: number | null;
          created_at?: string;
          frequency?: string | null;
          id?: string;
          mandatory?: boolean;
          max_ok?: number | null;
          max_warn?: number | null;
          medium?: Database['public']['Enums']['param_medium'];
          min_ok?: number | null;
          min_warn?: number | null;
          name_es?: string;
          siloe_param_id?: number;
          unit?: string | null;
          updated_at?: string;
          warn_margin_ratio?: number;
        };
        Relationships: [];
      };
      pool: {
        Row: {
          agua_alimentacion: Database['public']['Enums']['water_source'][];
          archived: boolean;
          ccaa: string | null;
          client_id: string;
          cp: string | null;
          created_at: string;
          denominacion: string;
          direccion: string | null;
          id: string;
          lat: number | null;
          lng: number | null;
          localidad: string | null;
          municipio: string | null;
          observaciones: string | null;
          org_id: string;
          pool_type: Database['public']['Enums']['pool_type'] | null;
          provincia: string | null;
          siloe_cod_ccaa: string | null;
          siloe_cod_p: string | null;
          updated_at: string;
        };
        Insert: {
          agua_alimentacion?: Database['public']['Enums']['water_source'][];
          archived?: boolean;
          ccaa?: string | null;
          client_id: string;
          cp?: string | null;
          created_at?: string;
          denominacion: string;
          direccion?: string | null;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          localidad?: string | null;
          municipio?: string | null;
          observaciones?: string | null;
          org_id: string;
          pool_type?: Database['public']['Enums']['pool_type'] | null;
          provincia?: string | null;
          siloe_cod_ccaa?: string | null;
          siloe_cod_p?: string | null;
          updated_at?: string;
        };
        Update: {
          agua_alimentacion?: Database['public']['Enums']['water_source'][];
          archived?: boolean;
          ccaa?: string | null;
          client_id?: string;
          cp?: string | null;
          created_at?: string;
          denominacion?: string;
          direccion?: string | null;
          id?: string;
          lat?: number | null;
          lng?: number | null;
          localidad?: string | null;
          municipio?: string | null;
          observaciones?: string | null;
          org_id?: string;
          pool_type?: Database['public']['Enums']['pool_type'] | null;
          provincia?: string | null;
          siloe_cod_ccaa?: string | null;
          siloe_cod_p?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pool_client_id_org_id_fkey';
            columns: ['client_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'client';
            referencedColumns: ['id', 'org_id'];
          },
          {
            foreignKeyName: 'pool_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'org';
            referencedColumns: ['id'];
          },
        ];
      };
      siloe_catalog: {
        Row: {
          extra: Json;
          id: number;
          kind: string;
          label_es: string;
          siloe_id: number;
        };
        Insert: {
          extra?: Json;
          id?: never;
          kind: string;
          label_es: string;
          siloe_id: number;
        };
        Update: {
          extra?: Json;
          id?: never;
          kind?: string;
          label_es?: string;
          siloe_id?: number;
        };
        Relationships: [];
      };
      treatment: {
        Row: {
          basin_id: string;
          comercial: string | null;
          created_at: string;
          details: Json;
          id: string;
          kind: Database['public']['Enums']['treatment_kind'];
          observaciones: string | null;
          org_id: string;
          updated_at: string;
        };
        Insert: {
          basin_id: string;
          comercial?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          kind: Database['public']['Enums']['treatment_kind'];
          observaciones?: string | null;
          org_id: string;
          updated_at?: string;
        };
        Update: {
          basin_id?: string;
          comercial?: string | null;
          created_at?: string;
          details?: Json;
          id?: string;
          kind?: Database['public']['Enums']['treatment_kind'];
          observaciones?: string | null;
          org_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'treatment_basin_id_org_id_fkey';
            columns: ['basin_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'basin';
            referencedColumns: ['id', 'org_id'];
          },
          {
            foreignKeyName: 'treatment_org_id_fkey';
            columns: ['org_id'];
            isOneToOne: false;
            referencedRelation: 'org';
            referencedColumns: ['id'];
          },
        ];
      };
      report: {
        Row: {
          analysis_type: Database['public']['Enums']['analysis_type'];
          basin_id: string;
          created_at: string;
          id: string;
          location_lat: number | null;
          location_lng: number | null;
          notes: string | null;
          org_id: string;
          pool_id: string;
          punto_muestreo: number | null;
          signature_path: string | null;
          signed_at: string | null;
          signed_by_dni: string | null;
          signed_by_name: string | null;
          status: Database['public']['Enums']['report_status'];
          technician_id: string | null;
          updated_at: string;
          visited_at: string;
        };
        Insert: {
          analysis_type?: Database['public']['Enums']['analysis_type'];
          basin_id: string;
          created_at?: string;
          id?: string;
          location_lat?: number | null;
          location_lng?: number | null;
          notes?: string | null;
          org_id: string;
          pool_id: string;
          punto_muestreo?: number | null;
          signature_path?: string | null;
          signed_at?: string | null;
          signed_by_dni?: string | null;
          signed_by_name?: string | null;
          status?: Database['public']['Enums']['report_status'];
          technician_id?: string | null;
          updated_at?: string;
          visited_at?: string;
        };
        Update: {
          analysis_type?: Database['public']['Enums']['analysis_type'];
          basin_id?: string;
          created_at?: string;
          id?: string;
          location_lat?: number | null;
          location_lng?: number | null;
          notes?: string | null;
          org_id?: string;
          pool_id?: string;
          punto_muestreo?: number | null;
          signature_path?: string | null;
          signed_at?: string | null;
          signed_by_dni?: string | null;
          signed_by_name?: string | null;
          status?: Database['public']['Enums']['report_status'];
          technician_id?: string | null;
          updated_at?: string;
          visited_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_basin_id_org_id_fkey';
            columns: ['basin_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'basin';
            referencedColumns: ['id', 'org_id'];
          },
          {
            foreignKeyName: 'report_pool_id_org_id_fkey';
            columns: ['pool_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'pool';
            referencedColumns: ['id', 'org_id'];
          },
          {
            foreignKeyName: 'report_technician_id_fkey';
            columns: ['technician_id'];
            isOneToOne: false;
            referencedRelation: 'app_user';
            referencedColumns: ['id'];
          },
        ];
      };
      measurement: {
        Row: {
          compliant: boolean | null;
          created_at: string;
          id: string;
          lugar: Database['public']['Enums']['measurement_lugar'];
          metodo: number | null;
          org_id: string;
          parameter_def_id: string;
          report_id: string;
          status: Database['public']['Enums']['measurement_status'];
          updated_at: string;
          value: number | null;
        };
        Insert: {
          compliant?: boolean | null;
          created_at?: string;
          id?: string;
          lugar?: Database['public']['Enums']['measurement_lugar'];
          metodo?: number | null;
          org_id: string;
          parameter_def_id: string;
          report_id: string;
          status?: Database['public']['Enums']['measurement_status'];
          updated_at?: string;
          value?: number | null;
        };
        Update: {
          compliant?: boolean | null;
          created_at?: string;
          id?: string;
          lugar?: Database['public']['Enums']['measurement_lugar'];
          metodo?: number | null;
          org_id?: string;
          parameter_def_id?: string;
          report_id?: string;
          status?: Database['public']['Enums']['measurement_status'];
          updated_at?: string;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'measurement_parameter_def_id_fkey';
            columns: ['parameter_def_id'];
            isOneToOne: false;
            referencedRelation: 'parameter_def';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'measurement_report_id_org_id_fkey';
            columns: ['report_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'report';
            referencedColumns: ['id', 'org_id'];
          },
        ];
      };
      incident: {
        Row: {
          corrective_action: string | null;
          created_at: string;
          description: string;
          id: string;
          org_id: string;
          report_id: string;
          updated_at: string;
        };
        Insert: {
          corrective_action?: string | null;
          created_at?: string;
          description: string;
          id?: string;
          org_id: string;
          report_id: string;
          updated_at?: string;
        };
        Update: {
          corrective_action?: string | null;
          created_at?: string;
          description?: string;
          id?: string;
          org_id?: string;
          report_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'incident_report_id_org_id_fkey';
            columns: ['report_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'report';
            referencedColumns: ['id', 'org_id'];
          },
        ];
      };
      attachment: {
        Row: {
          created_at: string;
          id: string;
          kind: Database['public']['Enums']['attachment_kind'];
          org_id: string;
          report_id: string;
          storage_path: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          kind: Database['public']['Enums']['attachment_kind'];
          org_id: string;
          report_id: string;
          storage_path: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database['public']['Enums']['attachment_kind'];
          org_id?: string;
          report_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'attachment_report_id_org_id_fkey';
            columns: ['report_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'report';
            referencedColumns: ['id', 'org_id'];
          },
        ];
      };
      annual_result: {
        Row: {
          analysis_type: Database['public']['Enums']['analysis_type'];
          basin_id: string;
          created_at: string;
          dias_apertura: number | null;
          fecha_apertura: string | null;
          fecha_cierre: string | null;
          generated_at: string;
          id: string;
          laboratorio: string | null;
          n_iniciales: number;
          n_periodicos: number;
          n_rutina: number;
          n_vigilancia: number | null;
          observaciones: string | null;
          org_id: string;
          punto_muestreo: number;
          updated_at: string;
          year: number;
        };
        Insert: {
          analysis_type?: Database['public']['Enums']['analysis_type'];
          basin_id: string;
          created_at?: string;
          dias_apertura?: number | null;
          fecha_apertura?: string | null;
          fecha_cierre?: string | null;
          generated_at?: string;
          id?: string;
          laboratorio?: string | null;
          n_iniciales?: number;
          n_periodicos?: number;
          n_rutina?: number;
          n_vigilancia?: number | null;
          observaciones?: string | null;
          org_id: string;
          punto_muestreo?: number;
          updated_at?: string;
          year: number;
        };
        Update: {
          analysis_type?: Database['public']['Enums']['analysis_type'];
          basin_id?: string;
          created_at?: string;
          dias_apertura?: number | null;
          fecha_apertura?: string | null;
          fecha_cierre?: string | null;
          generated_at?: string;
          id?: string;
          laboratorio?: string | null;
          n_iniciales?: number;
          n_periodicos?: number;
          n_rutina?: number;
          n_vigilancia?: number | null;
          observaciones?: string | null;
          org_id?: string;
          punto_muestreo?: number;
          updated_at?: string;
          year?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_result_basin_id_org_id_fkey';
            columns: ['basin_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'basin';
            referencedColumns: ['id', 'org_id'];
          },
        ];
      };
      annual_result_param: {
        Row: {
          annual_result_id: string;
          created_at: string;
          deter: number;
          deter_c: number;
          dias_nc: number;
          id: string;
          id_lugar: number;
          id_metodo: number;
          org_id: string;
          siloe_param_id: number;
          updated_at: string;
          vc_max: number | null;
          vc_med: number | null;
          vc_min: number | null;
        };
        Insert: {
          annual_result_id: string;
          created_at?: string;
          deter?: number;
          deter_c?: number;
          dias_nc?: number;
          id?: string;
          id_lugar?: number;
          id_metodo?: number;
          org_id: string;
          siloe_param_id: number;
          updated_at?: string;
          vc_max?: number | null;
          vc_med?: number | null;
          vc_min?: number | null;
        };
        Update: {
          annual_result_id?: string;
          created_at?: string;
          deter?: number;
          deter_c?: number;
          dias_nc?: number;
          id?: string;
          id_lugar?: number;
          id_metodo?: number;
          org_id?: string;
          siloe_param_id?: number;
          updated_at?: string;
          vc_max?: number | null;
          vc_med?: number | null;
          vc_min?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_result_param_annual_result_id_org_id_fkey';
            columns: ['annual_result_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'annual_result';
            referencedColumns: ['id', 'org_id'];
          },
        ];
      };
      annual_result_period: {
        Row: {
          annual_result_id: string;
          created_at: string;
          id: string;
          org_id: string;
          per_fecha_a: string;
          per_fecha_c: string;
          per_id_motivo: number | null;
          per_num_dias: number;
          per_observ_cierre: string | null;
        };
        Insert: {
          annual_result_id: string;
          created_at?: string;
          id?: string;
          org_id: string;
          per_fecha_a: string;
          per_fecha_c: string;
          per_id_motivo?: number | null;
          per_num_dias: number;
          per_observ_cierre?: string | null;
        };
        Update: {
          annual_result_id?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          per_fecha_a?: string;
          per_fecha_c?: string;
          per_id_motivo?: number | null;
          per_num_dias?: number;
          per_observ_cierre?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'annual_result_period_annual_result_id_org_id_fkey';
            columns: ['annual_result_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'annual_result';
            referencedColumns: ['id', 'org_id'];
          },
        ];
      };
      route: {
        Row: {
          created_at: string;
          distance_m: number | null;
          duration_s: number | null;
          id: string;
          org_id: string;
          route_date: string;
          start_lat: number | null;
          start_lng: number | null;
          technician_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          distance_m?: number | null;
          duration_s?: number | null;
          id?: string;
          org_id: string;
          route_date: string;
          start_lat?: number | null;
          start_lng?: number | null;
          technician_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          distance_m?: number | null;
          duration_s?: number | null;
          id?: string;
          org_id?: string;
          route_date?: string;
          start_lat?: number | null;
          start_lng?: number | null;
          technician_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      route_stop: {
        Row: {
          created_at: string;
          eta: string | null;
          id: string;
          leg_s: number | null;
          org_id: string;
          pool_id: string;
          route_id: string;
          seq: number;
        };
        Insert: {
          created_at?: string;
          eta?: string | null;
          id?: string;
          leg_s?: number | null;
          org_id: string;
          pool_id: string;
          route_id: string;
          seq: number;
        };
        Update: {
          created_at?: string;
          eta?: string | null;
          id?: string;
          leg_s?: number | null;
          org_id?: string;
          pool_id?: string;
          route_id?: string;
          seq?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'route_stop_route_id_org_id_fkey';
            columns: ['route_id', 'org_id'];
            isOneToOne: false;
            referencedRelation: 'route';
            referencedColumns: ['id', 'org_id'];
          },
        ];
      };
      xml_export: {
        Row: {
          created_at: string;
          created_by: string | null;
          file_path: string | null;
          id: string;
          item_count: number;
          kind: string;
          org_id: string;
          period_year: number | null;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          file_path?: string | null;
          id?: string;
          item_count?: number;
          kind: string;
          org_id: string;
          period_year?: number | null;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          file_path?: string | null;
          id?: string;
          item_count?: number;
          kind?: string;
          org_id?: string;
          period_year?: number | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_org_id: { Args: never; Returns: string };
      current_user_can_write: { Args: never; Returns: boolean };
      current_user_role: { Args: never; Returns: Database['public']['Enums']['user_role'] };
      provision_account: {
        Args: {
          p_account_type: Database['public']['Enums']['org_type'];
          p_full_name: string;
          p_org_name: string;
        };
        Returns: {
          created_at: string;
          id: string;
          name: string;
          type: Database['public']['Enums']['org_type'];
          updated_at: string;
        };
      };
    };
    Enums: {
      analysis_type: 'autocontrol' | 'vigilancia';
      attachment_kind: 'photo' | 'lab_pdf';
      basin_class: 'cubierto' | 'descubierto' | 'mixto';
      measurement_lugar: 'in_situ' | 'lab';
      measurement_status: 'green' | 'amber' | 'red' | 'unknown';
      org_type: 'owner' | 'company';
      report_status: 'draft' | 'completed' | 'signed';
      param_medium: 'water' | 'air';
      pool_type: 'tipo_1' | 'tipo_2' | 'tipo_3a';
      treatment_kind: 'filtracion' | 'desinfeccion' | 'coagulacion' | 'correccion_ph' | 'otros';
      user_role: 'admin' | 'technician' | 'viewer';
      water_source: 'red_publica' | 'mar' | 'captacion_propia';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database['public'];

export type Tables<T extends keyof DefaultSchema['Tables']> = DefaultSchema['Tables'][T]['Row'];
export type TablesInsert<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T]['Update'];
export type Enums<T extends keyof DefaultSchema['Enums']> = DefaultSchema['Enums'][T];
