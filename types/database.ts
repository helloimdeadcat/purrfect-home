/**
 * Database types aligned with supabase/migrations.
 * Money fields are strings to avoid JS floating-point errors (Postgres numeric).
 */

export type HouseholdRole = "owner" | "admin" | "member" | "viewer";

export type AccountType =
  | "bank_account"
  | "credit_card"
  | "cash"
  | "savings"
  | "investment"
  | "other";

export type CategoryType = "expense" | "income" | "both";

export type TransactionType = "expense" | "income" | "transfer" | "adjustment";

export type AdjustmentDirection = "increase" | "decrease";

export type BudgetPeriodType = "weekly" | "monthly" | "yearly" | "custom";

export type RecurrenceFrequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "custom";

export type RecurringOccurrenceStatus =
  | "pending"
  | "paid"
  | "skipped"
  | "overdue";

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type TaskKind = "task" | "event";

export type TaskRepeatKind = "none" | "daily" | "weekly" | "monthly";

export type WeighMode = "dry" | "raw" | "package" | "drained" | "edible" | "shelled";

export type ShoppingCategory = "meat_fish" | "dairy" | "grains" | "vegetables" | "fruit" | "fats" | "other";

export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

/** Postgres numeric serialized as string by supabase-js */
export type Money = string;

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          avatar_url: string | null;
          currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
          currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      households: {
        Row: {
          id: string;
          name: string;
          base_currency: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          base_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          base_currency?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      household_members: {
        Row: {
          id: string;
          household_id: string;
          user_id: string;
          role: HouseholdRole;
          display_name: string | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id: string;
          role?: HouseholdRole;
          display_name?: string | null;
          joined_at?: string;
        };
        Update: {
          id?: string;
          household_id?: string;
          user_id?: string;
          role?: HouseholdRole;
          display_name?: string | null;
          joined_at?: string;
        };
        Relationships: [];
      };
      household_invitations: {
        Row: {
          id: string;
          household_id: string;
          email: string;
          role: "member";
          token_hash: string;
          status: InvitationStatus;
          invited_by: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          email: string;
          role?: "member";
          token_hash: string;
          status?: InvitationStatus;
          invited_by: string;
          expires_at: string;
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["household_invitations"]["Insert"]
        >;
        Relationships: [];
      };
      accounts: {
        Row: {
          id: string;
          household_id: string;
          owner_member_id: string | null;
          name: string;
          type: AccountType;
          currency: string;
          initial_balance: Money;
          is_shared: boolean;
          is_active: boolean;
          color: string | null;
          icon: string | null;
          note: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          owner_member_id?: string | null;
          name: string;
          type: AccountType;
          currency?: string;
          initial_balance?: Money;
          is_shared?: boolean;
          is_active?: boolean;
          color?: string | null;
          icon?: string | null;
          note?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          household_id: string | null;
          name: string;
          icon: string | null;
          color: string | null;
          type: CategoryType;
          parent_id: string | null;
          is_system: boolean;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id?: string | null;
          name: string;
          icon?: string | null;
          color?: string | null;
          type: CategoryType;
          parent_id?: string | null;
          is_system?: boolean;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["categories"]["Insert"]>;
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          household_id: string;
          account_id: string;
          category_id: string | null;
          created_by: string;
          owner_member_id: string | null;
          type: TransactionType;
          amount: Money;
          currency: string;
          transaction_date: string;
          description: string | null;
          merchant: string | null;
          is_recurring: boolean;
          recurring_payment_id: string | null;
          is_necessary: boolean;
          is_confirmed: boolean;
          notes: string | null;
          adjustment_direction: AdjustmentDirection | null;
          income_source_id: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          household_id: string;
          account_id: string;
          category_id?: string | null;
          created_by: string;
          owner_member_id?: string | null;
          type: TransactionType;
          amount: Money;
          currency?: string;
          transaction_date: string;
          description?: string | null;
          merchant?: string | null;
          is_recurring?: boolean;
          recurring_payment_id?: string | null;
          is_necessary?: boolean;
          is_confirmed?: boolean;
          notes?: string | null;
          adjustment_direction?: AdjustmentDirection | null;
          income_source_id?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["transactions"]["Insert"]>;
        Relationships: [];
      };
      transfers: {
        Row: {
          id: string;
          household_id: string;
          from_account_id: string;
          to_account_id: string;
          amount: Money;
          currency: string;
          transfer_date: string;
          description: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          from_account_id: string;
          to_account_id: string;
          amount: Money;
          currency?: string;
          transfer_date: string;
          description?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["transfers"]["Insert"]>;
        Relationships: [];
      };
      budgets: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          period_type: BudgetPeriodType;
          start_date: string;
          end_date: string | null;
          amount: Money;
          category_id: string | null;
          account_id: string | null;
          member_id: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          period_type: BudgetPeriodType;
          start_date: string;
          end_date?: string | null;
          amount: Money;
          category_id?: string | null;
          account_id?: string | null;
          member_id?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["budgets"]["Insert"]>;
        Relationships: [];
      };
      goals: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          description: string | null;
          target_amount: Money;
          current_amount: Money;
          currency: string;
          target_date: string | null;
          account_id: string | null;
          icon: string | null;
          color: string | null;
          is_completed: boolean;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          description?: string | null;
          target_amount: Money;
          current_amount?: Money;
          currency?: string;
          target_date?: string | null;
          account_id?: string | null;
          icon?: string | null;
          color?: string | null;
          is_completed?: boolean;
          is_archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["goals"]["Insert"]>;
        Relationships: [];
      };
      goal_operations: {
        Row: {
          id: string;
          goal_id: string;
          household_id: string;
          type: "initial" | "deposit" | "withdraw" | "adjust";
          amount: Money;
          balance_after: Money;
          note: string | null;
          operation_date: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          goal_id: string;
          household_id: string;
          type: "initial" | "deposit" | "withdraw" | "adjust";
          amount: Money;
          balance_after: Money;
          note?: string | null;
          operation_date?: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["goal_operations"]["Insert"]
        >;
        Relationships: [];
      };
      recurring_payments: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          type: "expense" | "income";
          amount: Money;
          currency: string;
          category_id: string;
          account_id: string;
          frequency: RecurrenceFrequency;
          interval_days: number | null;
          day_of_month: number | null;
          weekday: number | null;
          start_date: string;
          end_date: string | null;
          next_due_date: string;
          description: string | null;
          is_active: boolean;
          is_archived: boolean;
          auto_create: boolean;
          /** Mandatory outflows reduce Safe-to-Spend; optional ones only the forecast. */
          is_mandatory: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          type?: "expense" | "income";
          is_mandatory?: boolean;
          amount: Money;
          currency?: string;
          category_id: string;
          account_id: string;
          frequency: RecurrenceFrequency;
          interval_days?: number | null;
          day_of_month?: number | null;
          weekday?: number | null;
          start_date: string;
          end_date?: string | null;
          next_due_date: string;
          description?: string | null;
          is_active?: boolean;
          is_archived?: boolean;
          auto_create?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recurring_payments"]["Insert"]
        >;
        Relationships: [];
      };
      recurring_payment_occurrences: {
        Row: {
          id: string;
          recurring_payment_id: string;
          household_id: string;
          scheduled_date: string;
          transaction_id: string | null;
          status: RecurringOccurrenceStatus;
          amount: Money | null;
          notes: string | null;
          processed_at: string | null;
          processed_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          recurring_payment_id: string;
          household_id: string;
          scheduled_date: string;
          transaction_id?: string | null;
          status?: RecurringOccurrenceStatus;
          amount?: Money | null;
          notes?: string | null;
          processed_at?: string | null;
          processed_by?: string | null;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["recurring_payment_occurrences"]["Insert"]
        >;
        Relationships: [];
      };
      income_sources: {
        Row: {
          id: string;
          household_id: string;
          member_id: string;
          name: string;
          amount: Money;
          currency: string;
          frequency: RecurrenceFrequency;
          next_date: string;
          account_id: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          member_id: string;
          name: string;
          amount: Money;
          currency?: string;
          frequency: RecurrenceFrequency;
          next_date: string;
          account_id: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["income_sources"]["Insert"]>;
        Relationships: [];
      };
      receipts: {
        Row: {
          id: string;
          household_id: string;
          transaction_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          transaction_id: string;
          storage_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          uploaded_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["receipts"]["Insert"]>;
        Relationships: [];
      };
      tags: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          color: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          color?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["tags"]["Insert"]>;
        Relationships: [];
      };
      transaction_tags: {
        Row: {
          transaction_id: string;
          tag_id: string;
        };
        Insert: {
          transaction_id: string;
          tag_id: string;
        };
        Update: {
          transaction_id?: string;
          tag_id?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          household_id: string;
          type: string;
          title: string;
          message: string;
          is_read: boolean;
          link: string | null;
          created_at: string;
          /** Set by the push dispatcher (migration 20261027120000). */
          pushed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          household_id: string;
          type: string;
          title: string;
          message: string;
          is_read?: boolean;
          link?: string | null;
          created_at?: string;
          pushed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Insert"]>;
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          id: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          last_used_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          last_used_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["push_subscriptions"]["Insert"]>;
        Relationships: [];
      };
      household_settings: {
        Row: {
          household_id: string;
          base_currency: string;
          timezone: string;
          week_starts_on: number;
          month_starts_on: number;
          default_account_id: string | null;
          default_category_id: string | null;
          /** Per-currency Safe-to-Spend reserve, e.g. { EUR: "500.00" } */
          safe_to_spend_reserves: Record<string, Money>;
        };
        Insert: {
          household_id: string;
          base_currency?: string;
          timezone?: string;
          week_starts_on?: number;
          month_starts_on?: number;
          default_account_id?: string | null;
          default_category_id?: string | null;
          safe_to_spend_reserves?: Record<string, Money>;
        };
        Update: Partial<
          Database["public"]["Tables"]["household_settings"]["Insert"]
        >;
        Relationships: [];
      };
      tasks: {
        Row: {
          id: string;
          household_id: string;
          title: string;
          notes: string | null;
          /** null = for both partners */
          assignee_member_id: string | null;
          kind: TaskKind;
          start_date: string | null;
          /** "HH:MM:SS" */
          start_time: string | null;
          end_time: string | null;
          repeat_kind: TaskRepeatKind;
          repeat_interval: number;
          /** ISO weekdays 1 = Mon … 7 = Sun */
          repeat_weekdays: number[] | null;
          repeat_day_of_month: number | null;
          repeat_until: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_by: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          title: string;
          notes?: string | null;
          assignee_member_id?: string | null;
          kind?: TaskKind;
          start_date?: string | null;
          start_time?: string | null;
          end_time?: string | null;
          repeat_kind?: TaskRepeatKind;
          repeat_interval?: number;
          repeat_weekdays?: number[] | null;
          repeat_day_of_month?: number | null;
          repeat_until?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_by?: string | null;
          is_archived?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Insert"]>;
        Relationships: [];
      };
      task_completions: {
        Row: {
          id: string;
          task_id: string;
          household_id: string;
          occurrence_date: string;
          completed_by: string;
          completed_at: string;
        };
        Insert: {
          id?: string;
          task_id: string;
          household_id: string;
          occurrence_date: string;
          completed_by?: string;
          completed_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["task_completions"]["Insert"]>;
        Relationships: [];
      };
      habits: {
        Row: {
          id: string;
          household_id: string;
          title: string;
          emoji: string | null;
          /** null = for everyone (each member tracks their own) */
          owner_member_id: string | null;
          goal_kind: "check" | "count";
          target: Money;
          unit: string | null;
          frequency: "daily" | "days" | "per_week";
          weekdays: number[] | null;
          times_per_week: number | null;
          start_date: string;
          is_archived: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          title: string;
          emoji?: string | null;
          owner_member_id?: string | null;
          goal_kind?: "check" | "count";
          target?: Money | number;
          unit?: string | null;
          frequency?: "daily" | "days" | "per_week";
          weekdays?: number[] | null;
          times_per_week?: number | null;
          start_date: string;
          is_archived?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["habits"]["Insert"]>;
        Relationships: [];
      };
      habit_checkins: {
        Row: {
          id: string;
          habit_id: string;
          household_id: string;
          member_id: string;
          checkin_date: string;
          value: Money;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          habit_id: string;
          household_id: string;
          member_id: string;
          checkin_date: string;
          value: Money | number;
        };
        Update: Partial<Database["public"]["Tables"]["habit_checkins"]["Insert"]>;
        Relationships: [];
      };
      foods: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          weigh_mode: WeighMode | null;
          shopping_category: ShoppingCategory;
          /** per 100 g */
          kcal: Money;
          protein: Money;
          fat: Money;
          carbs: Money;
          fiber: Money;
          grams_per_piece: Money | null;
          piece_label: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          weigh_mode?: WeighMode | null;
          shopping_category?: ShoppingCategory;
          kcal?: number;
          protein?: number;
          fat?: number;
          carbs?: number;
          fiber?: number;
          grams_per_piece?: number | null;
          piece_label?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["foods"]["Insert"]>;
        Relationships: [];
      };
      meal_plans: {
        Row: {
          id: string;
          household_id: string;
          name: string;
          notes: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          name: string;
          notes?: string | null;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["meal_plans"]["Insert"]>;
        Relationships: [];
      };
      meal_plan_meals: {
        Row: {
          id: string;
          plan_id: string;
          household_id: string;
          weekday: number;
          slot: MealSlot;
          title: string;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          household_id: string;
          weekday: number;
          slot: MealSlot;
          title: string;
          position?: number;
        };
        Update: Partial<Database["public"]["Tables"]["meal_plan_meals"]["Insert"]>;
        Relationships: [];
      };
      meal_plan_portions: {
        Row: {
          id: string;
          meal_id: string;
          household_id: string;
          food_id: string;
          member_id: string;
          grams: Money;
        };
        Insert: {
          id?: string;
          meal_id: string;
          household_id: string;
          food_id: string;
          member_id: string;
          grams: number;
        };
        Update: Partial<Database["public"]["Tables"]["meal_plan_portions"]["Insert"]>;
        Relationships: [];
      };
      nutrition_targets: {
        Row: {
          member_id: string;
          household_id: string;
          kcal: number | null;
          protein_min: number | null;
          protein_max: number | null;
          fat_min: number | null;
          fat_max: number | null;
          updated_at: string;
        };
        Insert: {
          member_id: string;
          household_id: string;
          kcal?: number | null;
          protein_min?: number | null;
          protein_max?: number | null;
          fat_min?: number | null;
          fat_max?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["nutrition_targets"]["Insert"]>;
        Relationships: [];
      };
      shopping_items: {
        Row: {
          id: string;
          household_id: string;
          title: string;
          is_done: boolean;
          sort_order: number;
          note: string | null;
          source: "manual" | "meal_plan";
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          title: string;
          is_done?: boolean;
          sort_order?: number;
          note?: string | null;
          source?: "manual" | "meal_plan";
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["shopping_items"]["Insert"]>;
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          household_id: string;
          user_id: string | null;
          entity_type: string;
          entity_id: string;
          action: string;
          old_data: Json | null;
          new_data: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          household_id: string;
          user_id?: string | null;
          entity_type: string;
          entity_id: string;
          action: string;
          old_data?: Json | null;
          new_data?: Json | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      cleanup_expired_data: {
        Args: Record<string, never>;
        Returns: Json;
      };
      list_purgeable_receipt_files: {
        Args: { p_limit?: number };
        Returns: { receipt_id: string | null; storage_path: string }[];
      };
      household_receipt_usage: {
        Args: { p_household_id: string };
        Returns: { files: number; bytes: number }[];
      };
      take_ai_quota: {
        Args: { p_kind: string; p_window_seconds: number; p_window_limit: number; p_daily_limit: number };
        Returns: boolean;
      };
      save_push_subscription: {
        Args: { p_endpoint: string; p_p256dh: string; p_auth: string; p_user_agent: string | null };
        Returns: string;
      };
      claim_notification_pushes: {
        Args: { p_household_id: string; p_limit?: number; p_max_age?: string };
        Returns: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          message: string;
          link: string | null;
          created_at: string;
        }[];
      };
      is_household_member: {
        Args: { p_household_id: string };
        Returns: boolean;
      };
      household_role: {
        Args: { p_household_id: string };
        Returns: string;
      };
      has_household_role: {
        Args: { p_household_id: string; allowed_roles: string[] };
        Returns: boolean;
      };
      bootstrap_first_household_for_user: {
        Args: {
          p_user_id: string;
          p_email: string;
          p_first_name: string | null;
          p_last_name: string | null;
          p_household_name: string;
          p_currency: string;
        };
        Returns: {
          household_id: string;
          member_id: string;
          created: boolean;
        }[];
      };
      accept_household_invitation: {
        Args: { p_token: string };
        Returns: {
          household_id: string;
          member_id: string;
          already_member: boolean;
        }[];
      };
      apply_goal_operation: {
        Args: {
          p_goal_id: string;
          p_type: string;
          p_amount: number | string;
          p_note?: string | null;
          p_operation_date?: string | null;
        };
        Returns: {
          goal_id: string;
          current_amount: string;
          is_completed: boolean;
          operation_id: string;
          balance_after: string;
        }[];
      };
      compute_next_recurring_due_date: {
        Args: {
          p_from: string;
          p_frequency: string;
          p_interval_days: number | null;
          p_day_of_month: number | null;
          p_weekday: number | null;
        };
        Returns: string;
      };
      confirm_recurring_occurrence: {
        Args: {
          p_occurrence_id: string;
          p_amount?: number | string | null;
          p_transaction_date?: string | null;
          p_notes?: string | null;
        };
        Returns: {
          occurrence_id: string;
          transaction_id: string;
          next_due_date: string;
          next_occurrence_id: string | null;
        }[];
      };
      skip_recurring_occurrence: {
        Args: {
          p_occurrence_id: string;
          p_notes?: string | null;
        };
        Returns: {
          occurrence_id: string;
          next_due_date: string;
          next_occurrence_id: string | null;
        }[];
      };
      preview_household_invitation: {
        Args: { p_token: string };
        Returns: {
          is_valid: boolean;
          household_name: string | null;
          invited_email: string | null;
          expires_at: string | null;
          status: string;
        }[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
