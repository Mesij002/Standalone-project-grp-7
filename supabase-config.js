const SUPABASE_URL = "https://dbpayrvsgzshmhbwenvx.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PBR1FqBO07aniMox3rRONw_so8DeVpj";

// If the Supabase library could not load (offline, blocked CDN), keep this
// as null so pages can show a clear message instead of crashing.
const supabaseClient = window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;
