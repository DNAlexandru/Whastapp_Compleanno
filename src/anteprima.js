// Prova senza WhatsApp.
//   npm run anteprima                      → prossimi 30 giorni
//   npm run anteprima -- 2026-11-15        → chi festeggia quel giorno
//   npm run anteprima -- 2026-11-15 --genera   → genera anche i messaggi con Gemini
//   npm run anteprima -- --persona dani_19 --genera
import { caricaConfig, caricaFamiglia, oggiNelFuso, chiaveData, compleanniDel, contesto, eta } from "./famiglia.js";
import { generaMessaggio } from "./messaggio.js";

const config = caricaConfig();
const famiglia = caricaFamiglia();
const args = process.argv.slice(2);
const genera = args.includes("--genera");
const dataArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
const personaArg = args.includes("--persona") ? args[args.indexOf("--persona") + 1] : null;

async function mostra(p, data, altri = []) {
  const anni = eta(p, data.anno);
  console.log(`\n━━ ${p.nome} (${p.id})${anni !== null ? ` — ${anni} anni` : ""}${p.defunto ? " — ricordo" : ""}`);
  console.log(contesto(p, famiglia, data, config).replace(/^/gm, "   "));
  if (genera) {
    const { testo, fonte } = await generaMessaggio(p, famiglia, data, config, { altriOggi: altri });
    console.log(`\n   ✉️  [${fonte}]\n${testo.replace(/^/gm, "   ")}`);
  }
}

if (personaArg) {
  const p = famiglia.perId.get(personaArg);
  if (!p) throw new Error(`Id sconosciuto: ${personaArg}`);
  await mostra(p, dataArg ? parse(dataArg) : oggiNelFuso(config.fusoOrario));
} else if (dataArg) {
  const data = parse(dataArg);
  const lista = compleanniDel(famiglia, data, { includiDefunti: config.ricordaDefunti });
  console.log(`Compleanni del ${dataArg}: ${lista.length || "nessuno"}`);
  for (const p of lista) await mostra(p, data, lista.filter((x) => x !== p));
} else {
  const oggi = oggiNelFuso(config.fusoOrario);
  const base = Date.UTC(oggi.anno, oggi.mese - 1, oggi.giorno);
  console.log("Prossimi 30 giorni:");
  for (let i = 0; i < 30; i++) {
    const d = new Date(base + i * 86_400_000);
    const data = { anno: d.getUTCFullYear(), mese: d.getUTCMonth() + 1, giorno: d.getUTCDate() };
    for (const p of compleanniDel(famiglia, data)) {
      const anni = eta(p, data.anno);
      const mostraEta = anni !== null && p.citaEta !== false && (p.citaEta === true || anni < config.sogliaEtaMenzionata);
      console.log(`  ${chiaveData(data)}  ${p.nome.padEnd(11)} ${p.id.padEnd(11)} ${anni ?? "?"} anni${mostraEta ? "" : "  (età non citata)"}`);
    }
  }
}

function parse(s) {
  const [anno, mese, giorno] = s.split("-").map(Number);
  return { anno, mese, giorno };
}
