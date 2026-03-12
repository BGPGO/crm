import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://gqjgbwzxlqkwvrtorhvb.supabase.co';

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_gB3FXNDiEEkAs0q0nQVVEA_6F4wEg7r';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
