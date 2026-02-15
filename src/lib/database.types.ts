export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      avatar_packs: {
        Row: {
          base_path: string;
          created_at: string;
          created_by: string | null;
          family_id: string;
          id: string;
          status: "queued" | "processing" | "ready" | "failed";
          style_id: string;
          user_id: string;
          version: number;
        };
        Insert: {
          base_path: string;
          created_at?: string;
          created_by?: string | null;
          family_id: string;
          id?: string;
          status?: "queued" | "processing" | "ready" | "failed";
          style_id: string;
          user_id: string;
          version: number;
        };
        Update: {
          base_path?: string;
          created_at?: string;
          created_by?: string | null;
          family_id?: string;
          id?: string;
          status?: "queued" | "processing" | "ready" | "failed";
          style_id?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [];
      };
      families: {
        Row: {
          created_at: string;
          created_by: string;
          id: string;
          name: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          id?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          id?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      family_members: {
        Row: {
          created_at: string;
          family_id: string;
          id: string;
          joined_at: string;
          role: "admin" | "member";
          status: "active" | "left" | "removed";
          user_id: string;
        };
        Insert: {
          created_at?: string;
          family_id: string;
          id?: string;
          joined_at?: string;
          role?: "admin" | "member";
          status?: "active" | "left" | "removed";
          user_id: string;
        };
        Update: {
          created_at?: string;
          family_id?: string;
          id?: string;
          joined_at?: string;
          role?: "admin" | "member";
          status?: "active" | "left" | "removed";
          user_id?: string;
        };
        Relationships: [];
      };
      game_events: {
        Row: {
          created_at: string;
          created_by: string | null;
          event_type: string;
          family_id: string;
          game_id: string;
          id: number;
          payload: Json;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          event_type: string;
          family_id: string;
          game_id: string;
          id?: number;
          payload?: Json;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          event_type?: string;
          family_id?: string;
          game_id?: string;
          id?: number;
          payload?: Json;
        };
        Relationships: [];
      };
      game_players: {
        Row: {
          created_at: string;
          family_id: string;
          game_id: string;
          id: string;
          player_order: number;
          tile_position: number;
          token_avatar_pack_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          family_id: string;
          game_id: string;
          id?: string;
          player_order: number;
          tile_position?: number;
          token_avatar_pack_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          family_id?: string;
          game_id?: string;
          id?: string;
          player_order?: number;
          tile_position?: number;
          token_avatar_pack_id?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      games: {
        Row: {
          created_at: string;
          created_by: string;
          current_turn_user_id: string | null;
          family_id: string;
          finished_at: string | null;
          id: string;
          mapping_id: string;
          room_id: string;
          started_at: string | null;
          status: "pending" | "active" | "finished" | "cancelled";
          updated_at: string;
          winner_user_id: string | null;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          current_turn_user_id?: string | null;
          family_id: string;
          finished_at?: string | null;
          id?: string;
          mapping_id?: string;
          room_id: string;
          started_at?: string | null;
          status?: "pending" | "active" | "finished" | "cancelled";
          updated_at?: string;
          winner_user_id?: string | null;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          current_turn_user_id?: string | null;
          family_id?: string;
          finished_at?: string | null;
          id?: string;
          mapping_id?: string;
          room_id?: string;
          started_at?: string | null;
          status?: "pending" | "active" | "finished" | "cancelled";
          updated_at?: string;
          winner_user_id?: string | null;
        };
        Relationships: [];
      };
      invites: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          expires_at: string;
          family_id: string;
          id: string;
          invitee_contact: string | null;
          invited_by: string;
          max_uses: number;
          status: "pending" | "accepted" | "revoked" | "expired";
          token: string;
          use_count: number;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          expires_at: string;
          family_id: string;
          id?: string;
          invitee_contact?: string | null;
          invited_by: string;
          max_uses?: number;
          status?: "pending" | "accepted" | "revoked" | "expired";
          token: string;
          use_count?: number;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          expires_at?: string;
          family_id?: string;
          id?: string;
          invitee_contact?: string | null;
          invited_by?: string;
          max_uses?: number;
          status?: "pending" | "accepted" | "revoked" | "expired";
          token?: string;
          use_count?: number;
        };
        Relationships: [];
      };
      messages: {
        Row: {
          content: string;
          created_at: string;
          family_id: string;
          id: number;
          metadata: Json;
          room_id: string;
          sender_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          family_id: string;
          id?: number;
          metadata?: Json;
          room_id: string;
          sender_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          family_id?: string;
          id?: number;
          metadata?: Json;
          room_id?: string;
          sender_id?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          created_at: string;
          created_by: string;
          family_id: string;
          id: string;
          kind: "chat" | "game";
          slug: string;
          title: string;
        };
        Insert: {
          created_at?: string;
          created_by: string;
          family_id: string;
          id?: string;
          kind: "chat" | "game";
          slug: string;
          title: string;
        };
        Update: {
          created_at?: string;
          created_by?: string;
          family_id?: string;
          id?: string;
          kind?: "chat" | "game";
          slug?: string;
          title?: string;
        };
        Relationships: [];
      };
      user_profiles: {
        Row: {
          avatar_style_id: string | null;
          board_skin_id: string;
          cinematics_enabled: boolean;
          created_at: string;
          display_name: string | null;
          family_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          avatar_style_id?: string | null;
          board_skin_id?: string;
          cinematics_enabled?: boolean;
          created_at?: string;
          display_name?: string | null;
          family_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          avatar_style_id?: string | null;
          board_skin_id?: string;
          cinematics_enabled?: boolean;
          created_at?: string;
          display_name?: string | null;
          family_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      family_role: "admin" | "member";
      game_status: "pending" | "active" | "finished" | "cancelled";
      invite_status: "pending" | "accepted" | "revoked" | "expired";
      room_type: "chat" | "game";
    };
    CompositeTypes: Record<string, never>;
  };
};
