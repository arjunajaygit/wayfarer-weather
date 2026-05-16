import { createClient } from '@supabase/supabase-js';

const supabaseUrl = "https://wizulqbzgrrkvlhotslq.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpenVscWJ6Z3Jya3ZsaG90c2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3NzAzNzQsImV4cCI6MjA5NDM0NjM3NH0.9H3-RifsqeCg3474pwzTyvLIQorh_8-H6wgmRVHX_iM";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);