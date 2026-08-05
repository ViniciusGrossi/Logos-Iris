export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  iris: {
    Tables: {
      appointments: {
        Row: {
          confirmacao_enviada_em: string | null
          contact_id: string
          conversation_id: string
          created_at: string
          horario: string
          id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          confirmacao_enviada_em?: string | null
          contact_id: string
          conversation_id: string
          created_at?: string
          horario: string
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          confirmacao_enviada_em?: string | null
          contact_id?: string
          conversation_id?: string
          created_at?: string
          horario?: string
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      artisanal_layer_versions: {
        Row: {
          conteudo: string
          created_at: string
          id: string
          publicado_em: string | null
          status: string
          tenant_id: string
          versao: number
        }
        Insert: {
          conteudo: string
          created_at?: string
          id?: string
          publicado_em?: string | null
          status?: string
          tenant_id: string
          versao: number
        }
        Update: {
          conteudo?: string
          created_at?: string
          id?: string
          publicado_em?: string | null
          status?: string
          tenant_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "artisanal_layer_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_memory_summaries: {
        Row: {
          contact_id: string
          created_at: string
          expira_em: string
          id: string
          periodo_fim: string
          periodo_inicio: string
          resumo_enc: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          expira_em: string
          id?: string
          periodo_fim: string
          periodo_inicio: string
          resumo_enc: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          expira_em?: string
          id?: string
          periodo_fim?: string
          periodo_inicio?: string
          resumo_enc?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_memory_summaries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_memory_summaries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nome_enc: string | null
          telefone_enc: string
          telefone_hash: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome_enc?: string | null
          telefone_enc: string
          telefone_hash: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome_enc?: string | null
          telefone_enc?: string
          telefone_hash?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_signals: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          payload: Json
          tenant_id: string
          tipo: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          payload?: Json
          tenant_id: string
          tipo: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          payload?: Json
          tenant_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_signals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_signals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_state: {
        Row: {
          conversation_id: string
          debounce_until: string | null
          expires_at: string
          state: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          conversation_id: string
          debounce_until?: string | null
          expires_at: string
          state?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          debounce_until?: string | null
          expires_at?: string
          state?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_state_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_state_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          pausada_ate: string | null
          persona_ativa: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          pausada_ate?: string | null
          persona_ativa: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          pausada_ate?: string | null
          persona_ativa?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_ups: {
        Row: {
          agendado_para: string
          conversation_id: string
          created_at: string
          id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          agendado_para: string
          conversation_id: string
          created_at?: string
          id?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          agendado_para?: string
          conversation_id?: string
          created_at?: string
          id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "follow_ups_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follow_ups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      handoff_events: {
        Row: {
          acionado_em: string
          conversation_id: string
          gatilho: string
          id: string
          resolvido_em: string | null
          retomada_confirmada: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acionado_em?: string
          conversation_id: string
          gatilho: string
          id?: string
          resolvido_em?: string | null
          retomada_confirmada?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acionado_em?: string
          conversation_id?: string
          gatilho?: string
          id?: string
          resolvido_em?: string | null
          retomada_confirmada?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "handoff_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "handoff_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base_entries: {
        Row: {
          campo: string
          conteudo: Json
          contradicao_detectada: boolean
          created_at: string
          id: string
          publicado_em: string | null
          status: string
          tenant_id: string
          versao: number
        }
        Insert: {
          campo: string
          conteudo: Json
          contradicao_detectada?: boolean
          created_at?: string
          id?: string
          publicado_em?: string | null
          status?: string
          tenant_id: string
          versao: number
        }
        Update: {
          campo?: string
          conteudo?: Json
          contradicao_detectada?: boolean
          created_at?: string
          id?: string
          publicado_em?: string | null
          status?: string
          tenant_id?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          contact_id: string | null
          content_enc: string | null
          created_at: string
          embedding: string
          id: string
          source_id: string
          source_type: string
          tenant_id: string
        }
        Insert: {
          contact_id?: string | null
          content_enc?: string | null
          created_at?: string
          embedding: string
          id?: string
          source_id: string
          source_type: string
          tenant_id: string
        }
        Update: {
          contact_id?: string | null
          content_enc?: string | null
          created_at?: string
          embedding?: string
          id?: string
          source_id?: string
          source_type?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages_2026_08: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_09: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_10: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_11: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2026_12: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2027_01: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2027_02: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2027_03: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2027_04: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2027_05: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2027_06: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2027_07: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      messages_2027_08: {
        Row: {
          conteudo_enc: string
          conversation_id: string
          created_at: string
          custo_usd: number | null
          direcao: string
          from_me_detectado: boolean
          id: string
          latencia_ms: number | null
          model_id: string | null
          provider_message_id: string | null
          tenant_id: string
          tipo_midia: string
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          conteudo_enc: string
          conversation_id: string
          created_at?: string
          custo_usd?: number | null
          direcao: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          conteudo_enc?: string
          conversation_id?: string
          created_at?: string
          custo_usd?: number | null
          direcao?: string
          from_me_detectado?: boolean
          id?: string
          latencia_ms?: number | null
          model_id?: string | null
          provider_message_id?: string | null
          tenant_id?: string
          tipo_midia?: string
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: []
      }
      model_circuit_state: {
        Row: {
          failure_count: number
          half_open_at: string | null
          model_id: string
          opened_at: string | null
          state: string
          updated_at: string
        }
        Insert: {
          failure_count?: number
          half_open_at?: string | null
          model_id: string
          opened_at?: string | null
          state?: string
          updated_at?: string
        }
        Update: {
          failure_count?: number
          half_open_at?: string | null
          model_id?: string
          opened_at?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_circuit_state_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: true
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
        ]
      }
      model_registry: {
        Row: {
          ativo: boolean
          created_at: string
          custo_por_1k_tokens_input: number
          custo_por_1k_tokens_output: number
          id: string
          model_name: string
          prioridade_fallback: number
          provider: string
          task_type: string
          tier: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          custo_por_1k_tokens_input: number
          custo_por_1k_tokens_output: number
          id?: string
          model_name: string
          prioridade_fallback: number
          provider: string
          task_type: string
          tier: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          custo_por_1k_tokens_input?: number
          custo_por_1k_tokens_output?: number
          id?: string
          model_name?: string
          prioridade_fallback?: number
          provider?: string
          task_type?: string
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_usage_log: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: [
          {
            foreignKeyName: "model_usage_log_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_usage_log_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "model_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_usage_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      model_usage_log_2026_08: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2026_09: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2026_10: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2026_11: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2026_12: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2027_01: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2027_02: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2027_03: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2027_04: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2027_05: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2027_06: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2027_07: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      model_usage_log_2027_08: {
        Row: {
          conversation_id: string
          created_at: string
          custo_usd: number
          escalonou_para_humano: boolean
          id: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          custo_usd: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms: number
          model_id: string
          tenant_id: string
          tokens_input: number
          tokens_output: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          custo_usd?: number
          escalonou_para_humano?: boolean
          id?: string
          latencia_ms?: number
          model_id?: string
          tenant_id?: string
          tokens_input?: number
          tokens_output?: number
        }
        Relationships: []
      }
      plans: {
        Row: {
          api_oficial_meta_addon_disponivel: boolean
          auditoria_qualidade_incluida: boolean
          created_at: string
          follow_ups_automaticos_mes: number
          id: string
          limite_mensagens_mes: number
          max_personas_ativas: number
          nome: string
          retencao_memoria_dias: number
          roteador_invisivel_incluso: boolean
          seats_painel: number
          tier_modelo: string
          updated_at: string
          voz_clonada_addon_disponivel: boolean
        }
        Insert: {
          api_oficial_meta_addon_disponivel?: boolean
          auditoria_qualidade_incluida?: boolean
          created_at?: string
          follow_ups_automaticos_mes: number
          id?: string
          limite_mensagens_mes: number
          max_personas_ativas: number
          nome: string
          retencao_memoria_dias?: number
          roteador_invisivel_incluso?: boolean
          seats_painel?: number
          tier_modelo: string
          updated_at?: string
          voz_clonada_addon_disponivel?: boolean
        }
        Update: {
          api_oficial_meta_addon_disponivel?: boolean
          auditoria_qualidade_incluida?: boolean
          created_at?: string
          follow_ups_automaticos_mes?: number
          id?: string
          limite_mensagens_mes?: number
          max_personas_ativas?: number
          nome?: string
          retencao_memoria_dias?: number
          roteador_invisivel_incluso?: boolean
          seats_painel?: number
          tier_modelo?: string
          updated_at?: string
          voz_clonada_addon_disponivel?: boolean
        }
        Relationships: []
      }
      tenant_members: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          role: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nome_empresa: string
          personas_ativas: string[]
          plano_id: string
          roteador_invisivel_ativo: boolean
          status: string
          timezone: string
          updated_at: string
          whatsapp_connection_status: string
          whatsapp_number: string
          whatsapp_provider: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome_empresa: string
          personas_ativas?: string[]
          plano_id: string
          roteador_invisivel_ativo?: boolean
          status?: string
          timezone?: string
          updated_at?: string
          whatsapp_connection_status?: string
          whatsapp_number: string
          whatsapp_provider: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nome_empresa?: string
          personas_ativas?: string[]
          plano_id?: string
          roteador_invisivel_ativo?: boolean
          status?: string
          timezone?: string
          updated_at?: string
          whatsapp_connection_status?: string
          whatsapp_number?: string
          whatsapp_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenants_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_inbox: {
        Row: {
          provider_message_id: string
          received_at: string
          tenant_id: string
        }
        Insert: {
          provider_message_id: string
          received_at?: string
          tenant_id: string
        }
        Update: {
          provider_message_id?: string
          received_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_inbox_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_connections: {
        Row: {
          created_at: string
          credentials_ref: string | null
          instance_id: string | null
          provider: string
          session_status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials_ref?: string | null
          instance_id?: string | null
          provider: string
          session_status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials_ref?: string | null
          instance_id?: string | null
          provider?: string
          session_status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      gateway_enqueue_whatsapp_message: {
        Args: { p_payload: Json }
        Returns: number
      }
      gateway_find_contact_id: {
        Args: { p_telefone: string; p_tenant_id: string }
        Returns: string
      }
      router_route_inbound_message: {
        Args: { p_payload: Json; p_tenant_id: string }
        Returns: string
      }
      router_consume_whatsapp_inbound: {
        Args: { p_max: number }
        Returns: Json
      }
      router_delete_whatsapp_inbound: {
        Args: { p_msg_id: number }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  iris_private: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      decrypt_pii: { Args: { p_value: string }; Returns: string }
      encrypt_pii: { Args: { p_value: string }; Returns: string }
      ensure_monthly_partition: {
        Args: { p_month: string; p_schema: string; p_table: string }
        Returns: undefined
      }
      ensure_next_partitions: { Args: never; Returns: undefined }
      phone_hash: { Args: { p_value: string }; Returns: string }
      pii_key: { Args: never; Returns: string }
      pii_pepper: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  iris: {
    Enums: {},
  },
  iris_private: {
    Enums: {},
  },
} as const
