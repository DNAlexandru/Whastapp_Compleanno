# Auguri WhatsApp 🎂

Ogni mattina controlla `data/famiglia.json`, scrive con Gemini un augurio personalizzato
(in rumeno, usando legami familiari; età citata sotto i 60 anni o con `citaEta: true`, come per il nonno) e lo pubblica nel gruppo WhatsApp
di famiglia — prima chiedendo a te l'approvazione.

## Come funziona

1. Alle `ora` (default 09:00, ora di Chișinău) trova chi festeggia oggi.
2. Gemini scrive il messaggio. Se l'API non risponde, usa un testo di riserva: il compleanno non salta mai.
3. Modalità **approvazione**: il bot ti scrive in privato l'anteprima. Rispondi:
   - `ok` → la pubblica nel gruppo
   - `rigenera` (es. `rigenera più scherzoso`) → nuova versione
   - `testo: La mulți ani...` → pubblica il tuo testo
   - `salta` → niente
   - se più compleanni lo stesso giorno: `ok 1`, `ok 2`, …
   - senza risposta entro `scadenzaApprovazione` (13:00) → invio automatico (`seNessunaRisposta`).
4. Altri comandi in privato al bot: `stato` (situazione di oggi), `prova dani_19` (anteprima di prova, non pubblicata).
5. Il tuo compleanno (`"io": true`) si pubblica senza approvazione, così non vedi la sorpresa.

## Setup (una volta)

**1. Numero del bot.** Serve un numero con WhatsApp (seconda SIM / eSIM / WhatsApp Business su un secondo telefono).
Il numero **deve essere membro del gruppo**: fallo aggiungere da un amministratore. Dagli un nome tipo "🎂 Calendarul familiei".
Se il gruppo permette di scrivere solo agli admin, il bot deve essere admin.

**2. Chiave Gemini** (gratuita, da https://aistudio.google.com/apikey):
```bash
cp .env.example .env   # poi incolla la chiave in GEMINI_API_KEY
```
Il modello si cambia in `config.json` → `modelloGemini`.

**3. Configura `config.json`.**
| Campo | Significato |
|---|---|
| `gruppo` | nome esatto del gruppo (vedi passo 4) |
| `approvatore` | il TUO numero, con prefisso, senza `+` (es. `393331234567`) |
| `modalita` | `approvazione` oppure `diretto` |
| `ora`, `fusoOrario` | quando inviare |
| `sogliaEtaMenzionata` | da questa età in su l'età non viene citata |
| `ricordaDefunti` | `true` = nel compleanno della bunica Ifimia propone un ricordo (sempre con approvazione) |
| `lingua`, `tono`, `firma` | stile del messaggio |

**4. Collega il bot e trova il nome del gruppo.**
```bash
npm run gruppi
```
La prima volta compare un QR: sul telefono del bot → WhatsApp → Impostazioni → Dispositivi collegati → Collega dispositivo.
Poi stampa i gruppi visibili: copia il nome esatto in `config.json`.

**5. Prova senza toccare WhatsApp.**
```bash
npm run anteprima                                  # prossimi 30 giorni
npm run anteprima -- 2026-11-24 --genera           # messaggio che uscirebbe quel giorno
npm run anteprima -- --persona tudor --genera
```

**6. Avvio permanente sul Mac** (parte al login, si riavvia da solo):
```bash
mkdir -p logs && cp com.auguri-whatsapp.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.auguri-whatsapp.plist
```
Log: `logs/bot.log`. Fermarlo: `launchctl unload ~/Library/LaunchAgents/com.auguri-whatsapp.plist`.

Il Mac deve essere acceso e sveglio all'ora d'invio. Se dorme, il bot recupera appena si risveglia (stesso giorno).
Il telefono del bot deve aprire WhatsApp almeno ogni ~14 giorni, altrimenti i dispositivi collegati vengono scollegati.

## Personalizzare

In `data/famiglia.json`, campo `note`: hobby, lavoro, eventi dell'anno ("si è laureata", "primo anno di scuola").
Campo `telefono`: per menzionare la persona con @ nel gruppo. `"attivo": false` per escludere qualcuno.

## Rischi

`whatsapp-web.js` non è ufficiale: WhatsApp può bannare il numero. Con ~40 messaggi l'anno il rischio è basso,
ma per questo si usa un numero secondario e non il tuo.
