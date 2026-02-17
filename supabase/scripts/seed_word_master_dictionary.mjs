import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizeWord(raw) {
  const word = raw.trim().toLowerCase();
  if (!word) return null;
  if (!/^[a-z]+$/.test(word)) return null;
  if (word.length < 2 || word.length > 32) return null;
  return word;
}

async function main() {
  const [fileArg] = process.argv.slice(2);
  if (!fileArg) {
    console.error("Usage: node supabase/scripts/seed_word_master_dictionary.mjs <wordlist.txt>");
    console.error("Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Word list file not found: ${filePath}`);
  }

  const supabaseUrl = requireEnv("SUPABASE_URL");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  const text = fs.readFileSync(filePath, "utf8");
  const unique = new Set();
  for (const line of text.split(/\r?\n/)) {
    const word = normalizeWord(line);
    if (word) unique.add(word);
  }

  const words = Array.from(unique);
  if (words.length === 0) {
    throw new Error("No valid words found in the input file.");
  }

  console.log(`Preparing to upsert ${words.length} words into public.word_master_dictionary_words...`);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const batchSize = 5000;
  let offset = 0;
  while (offset < words.length) {
    const batch = words.slice(offset, offset + batchSize).map((word) => ({ word }));
    const { error } = await supabase.from("word_master_dictionary_words").upsert(batch, {
      onConflict: "word",
      ignoreDuplicates: true,
    });

    if (error) {
      throw new Error(`Upsert failed at offset ${offset}: ${error.message}`);
    }

    offset += batch.length;
    console.log(`Seeded ${offset}/${words.length}`);
  }

  console.log("Done.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

