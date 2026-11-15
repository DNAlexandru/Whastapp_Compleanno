import { GoogleGenAI } from "@google/genai";
import { contesto, eta } from "./famiglia.js";

let ai;

/** Gemini (chiave gratuita da https://aistudio.google.com/apikey, in .env come GEMINI_API_KEY). */
async function viaGemini(sistema, utente, config) {
  if (!process.env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY mancante nel file .env");
  ai ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const r = await ai.models.generateContent({
    model: config.modelloGemini,
    contents: utente,
    config: { systemInstruction: sistema, temperature: 0.9 },
  });
  return (r.text ?? "").trim();
}

function promptSistema(config) {
  return `Scrivi messaggi di auguri di compleanno da pubblicare in un gruppo WhatsApp di una famiglia moldava.
Lingua del messaggio: ${config.lingua}, naturale, calda, moderna e corretta, con i diacritici giusti (ă, â, î, ș, ț).
Tono: ${config.tono}.
Regole fondamentali:
- Rivolgiti alla persona SEMPLICEMENTE con il suo nome (es. "La mulți ani, Dani!", "Dragi Dani, la mulți ani!").
- MAI e poi mai usare formule anagrafiche o patronimici tipo "al Maricăi", "al lui X", "fiul lui...": nessuno parla così in famiglia, è innaturale e ridicolo.
- Il messaggio deve essere ricco di significato, affettuoso e spontaneo: auguri sinceri di salute, gioia, serenità e sogni realizzati. Niente frasi pompose, arcaiche o da tema scolastico.
- Prospettiva corale e generica: gli auguri arrivano da tutta la famiglia insieme (es. "Noi toți îți dorim...", "Îți urăm cu drag...", "Te îmbrățișăm cu toții..."), MAI in prima persona singolare ("io", "da parte mia").
- 2-4 frasi belle, fluide e armoniose (~40-70 parole).
- Usa solo 1 o 2 emoji festose (es. 🎂, 🎉, ✨), senza esagerare.
- Se si fa riferimento ai cari o alla famiglia, fallo in modo dolce e generale (es. "alături de cei dragi", "alături de cei dragi ție"), senza mai fare elenchi forzati di nomi di parenti.
- Rispetta alla lettera le indicazioni sull'età (se non va menzionata, non citarla).
- Niente virgolette attorno al testo, niente hashtag.
${config.firma ? `- Chiudi con la firma: ${config.firma}` : "- Nessuna firma."}
Rispondi SOLO con il testo del messaggio.`;
}

/** Messaggio di riserva se l'AI non risponde: il compleanno non va mai perso. */
export function messaggioRiserva(p, anno, config) {
  if (p.defunto) return `🕯️ Astăzi ne amintim cu drag de ${p.nome}. Rămâi mereu în inimile noastre.`;
  const anni = eta(p, anno);
  const de = anni % 100 === 0 || anni % 100 >= 20 ? "de " : "";
  const cita = anni !== null && p.citaEta !== false && (p.citaEta === true || anni < config.sogliaEtaMenzionata);
  const conAnni = cita ? ` Felicitări pentru cei ${anni} ${de}ani!` : "";
  return `🎉 La mulți ani, ${p.nome}! Îți dorim sănătate, fericire și multă dragoste alături de cei dragi.${conAnni} 🎂`;
}

export async function generaMessaggio(p, famiglia, data, config, { altriOggi = [], richiestaExtra = "" } = {}) {
  let utente = `Contesto della persona che festeggia oggi:\n${contesto(p, famiglia, data, config)}`;
  if (altriOggi.length) utente += `\n\nOggi festeggiano anche: ${altriOggi.map((x) => x.nome).join(", ")} (riceveranno un messaggio separato).`;
  if (richiestaExtra) utente += `\n\nIndicazione aggiuntiva: ${richiestaExtra}`;

  try {
    const testo = await viaGemini(promptSistema(config), utente, config);
    if (!testo) throw new Error("risposta vuota");
    return { testo, fonte: "gemini" };
  } catch (err) {
    console.error(`[messaggio] Gemini non disponibile per ${p.id}: ${err.message} — uso il testo di riserva`);
    return { testo: messaggioRiserva(p, data.anno, config), fonte: "riserva" };
  }
}
