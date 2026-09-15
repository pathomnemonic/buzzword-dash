/**
 * ankiimport.js — Anki card import with AI conversion
 *
 * Supports:
 * - Parsing CSV/TSV text (tab or comma delimited)
 * - Parsing .apkg files (Anki deck packages) in the browser
 * - Converting flashcards to game-compatible format using OpenAI or Anthropic APIs
 * - Raw import without AI conversion
 * - Full UI rendering and event binding
 *
 * The .apkg format is a ZIP file containing a SQLite database (collection.anki2
 * or collection.anki21). Fields in each note are separated by the unit separator
 * character \x1f (0x1F). The first two fields are extracted as front/back. [1][2][6][8]
 *
 * JSZip is loaded from CDN for unzipping .apkg files. [1]
 * sql.js is loaded from CDN for reading the SQLite database. [1][3][4]
 *
 * Uses ES modules. No server required — runs entirely in the browser.
 */

var JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
var SQLJS_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.js';
var SQLJS_WASM_URL = 'https://cdn.jsdelivr.net/npm/sql.js@1.8.0/dist/sql-wasm.wasm';

var SUBJECTS = [
    "Neurology", "Cardiology", "Nephrology", "Psychiatry", "Gastroenterology",
    "Pulmonology", "Infectious Disease", "Endocrinology", "Hematology/Oncology",
    "Rheumatology", "Obstetrics/Gynecology", "Pediatrics", "Surgery",
    "Emergency Medicine", "Multisystem / Mixed"
];

// ===== DYNAMIC SCRIPT LOADING =====

/**
 * Load a script from a URL, returning a Promise.
 * Checks if a script with that src already exists to avoid duplicates.
 * @param {string} url
 * @returns {Promise<void>}
 */
function loadScript(url) {
    return new Promise(function (resolve, reject) {
        // Check if already loaded
        var existing = document.querySelector('script[src="' + url + '"]');
        if (existing) {
            // If script tag exists, check if it's already loaded
            if (existing.dataset.loaded === 'true') {
                resolve();
                return;
            }
            // Wait for it to load
            existing.addEventListener('load', function () {
                existing.dataset.loaded = 'true';
                resolve();
            });
            existing.addEventListener('error', function () {
                reject(new Error('Failed to load script: ' + url));
            });
            return;
        }

        var script = document.createElement('script');
        script.src = url;
        script.async = true;

        script.onload = function () {
            script.dataset.loaded = 'true';
            resolve();
        };

        script.onerror = function () {
            reject(new Error('Failed to load script: ' + url));
        };

        document.head.appendChild(script);
    });
}

// ===== CSV/TSV PARSING =====

/**
 * Parse tab-separated or CSV text where each line has front/back of a flashcard.
 * Handles both tab and comma delimiters. Skips empty lines.
 * @param {string} text
 * @returns {Array<{front: string, back: string}>}
 */
function parseCSV(text) {
    var lines = text.split(/\r?\n/);
    var results = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line) continue;

        var parts = null;

        // Try tab first (most common for Anki exports)
        if (line.indexOf('\t') >= 0) {
            parts = line.split('\t');
        } else if (line.indexOf(',') >= 0) {
            // Simple comma split (doesn't handle quoted fields with commas)
            parts = line.split(',');
        }

        if (parts && parts.length >= 2) {
            var front = parts[0].trim();
            var back = parts.slice(1).join(', ').trim(); // Join remaining as back
            if (front && back) {
                results.push({ front: front, back: back });
            }
        }
    }

    return results;
}

// ===== APKG PARSING =====

/**
 * Parse an .apkg file (Anki deck package).
 * Loads JSZip and sql.js dynamically from CDN.
 * The .apkg is a ZIP containing a SQLite database with notes table.
 * Fields in each note are separated by \x1f (unit separator). [6][8]
 *
 * @param {File} file - A File object (.apkg)
 * @returns {Promise<Array<{front: string, back: string}>>}
 */
async function parseApkg(file) {
    // Load JSZip
    await loadScript(JSZIP_URL);
    if (typeof JSZip === 'undefined') {
        throw new Error('JSZip failed to load');
    }

    // Load sql.js
    await loadScript(SQLJS_URL);
    if (typeof initSqlJs === 'undefined') {
        throw new Error('sql.js failed to load');
    }

    // Read the file as ArrayBuffer
    var arrayBuffer = await file.arrayBuffer();

    // Unzip with JSZip
    var zip = await JSZip.loadAsync(arrayBuffer);

    // Look for the SQLite database file inside the ZIP
    var dbFile = null;
    var dbFilenames = ['collection.anki2', 'collection.anki21'];

    for (var fi = 0; fi < dbFilenames.length; fi++) {
        if (zip.files[dbFilenames[fi]]) {
            dbFile = zip.files[dbFilenames[fi]];
            break;
        }
    }

    if (!dbFile) {
        throw new Error(
            'Could not find collection.anki2 or collection.anki21 in the .apkg file. ' +
            'If this is a newer Anki export, try re-exporting with "Support older Anki versions" enabled.'
        );
    }

    // Extract the database file as Uint8Array
    var dbData = await dbFile.async('uint8array');

    // Initialize sql.js with WASM
    var SQL = await initSqlJs({
        locateFile: function () {
            return SQLJS_WASM_URL;
        }
    });

    // Open the database
    var db = new SQL.Database(dbData);

    // Query the notes table
    var results = [];
    try {
        var stmt = db.prepare('SELECT flds FROM notes');
        while (stmt.step()) {
            var row = stmt.get();
            var flds = row[0]; // flds column contains fields separated by \x1f

            if (typeof flds === 'string') {
                var fields = flds.split('\x1f');
                if (fields.length >= 2) {
                    var front = stripHtml(fields[0]).trim();
                    var back = stripHtml(fields[1]).trim();
                    if (front && back) {
                        results.push({ front: front, back: back });
                    }
                }
            }
        }
        stmt.free();
    } catch (e) {
        console.warn('Error reading notes from database:', e.message);
    }

    db.close();
    return results;
}

/**
 * Strip HTML tags from a string.
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
    if (!html) return '';
    // Remove HTML tags
    var text = html.replace(/<[^>]*>/g, ' ');
    // Decode common HTML entities
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");
    text = text.replace(/&nbsp;/g, ' ');
    // Collapse multiple spaces
    text = text.replace(/\s+/g, ' ');
    return text.trim();
}

// ===== AI CONVERSION =====

/**
 * System prompt for AI conversion of flashcards to game format.
 */
var AI_SYSTEM_PROMPT =
    'Convert this flashcard into a multiple choice question for medical board exam prep. ' +
    'The front is the question/prompt and the back is the answer. ' +
    'Return ONLY valid JSON with these fields: ' +
    'buzzwords (array of 2-4 key clinical terms extracted from the question), ' +
    'answer (the correct answer as a concise string), ' +
    'distractors (array of exactly 2 plausible wrong answers that a medical student might confuse), ' +
    'teachingPoint (1-2 sentence explanation of why the answer is correct), ' +
    'subject (best matching from this list: Neurology, Cardiology, Nephrology, Psychiatry, ' +
    'Gastroenterology, Pulmonology, Infectious Disease, Endocrinology, Hematology/Oncology, ' +
    'Rheumatology, Obstetrics/Gynecology, Pediatrics, Surgery, Emergency Medicine, Multisystem / Mixed)';

/**
 * Convert flashcards using AI (OpenAI or Anthropic).
 * Processes cards sequentially with a 500ms delay to avoid rate limits.
 *
 * @param {Array<{front: string, back: string}>} cards
 * @param {string} apiKey
 * @param {string} provider - 'openai' or 'anthropic'
 * @param {function} onProgress - callback(current, total)
 * @returns {Promise<Array>} Successfully converted card objects
 */
async function convertWithAI(cards, apiKey, provider, onProgress) {
    var converted = [];

    for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var userMessage = 'Front: ' + card.front + '\nBack: ' + card.back;

        try {
            var responseText = '';

            if (provider === 'openai') {
                var openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + apiKey
                    },
                    body: JSON.stringify({
                        model: 'gpt-4o-mini',
                        messages: [
                            { role: 'system', content: AI_SYSTEM_PROMPT },
                            { role: 'user', content: userMessage }
                        ],
                        temperature: 0.3
                    })
                });

                if (!openaiResponse.ok) {
                    var errBody = '';
                    try { errBody = await openaiResponse.text(); } catch (e) {}
                    console.warn('OpenAI API error for card ' + (i + 1) + ':', openaiResponse.status, errBody);
                    if (onProgress) onProgress(i + 1, cards.length);
                    continue;
                }

                var openaiData = await openaiResponse.json();
                if (openaiData.choices && openaiData.choices[0] && openaiData.choices[0].message) {
                    responseText = openaiData.choices[0].message.content;
                }

            } else if (provider === 'anthropic') {
                var anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true'
                    },
                    body: JSON.stringify({
                        model: 'claude-sonnet-4-20250514',
                        max_tokens: 1024,
                        system: AI_SYSTEM_PROMPT,
                        messages: [
                            { role: 'user', content: userMessage }
                        ]
                    })
                });

                if (!anthropicResponse.ok) {
                    var errBody2 = '';
                    try { errBody2 = await anthropicResponse.text(); } catch (e) {}
                    console.warn('Anthropic API error for card ' + (i + 1) + ':', anthropicResponse.status, errBody2);
                    if (onProgress) onProgress(i + 1, cards.length);
                    continue;
                }

                var anthropicData = await anthropicResponse.json();
                if (anthropicData.content && anthropicData.content[0]) {
                    responseText = anthropicData.content[0].text;
                }
            }

            // Parse the JSON from the response
            if (responseText) {
                // Try to extract JSON from the response (may be wrapped in markdown code blocks)
                var jsonMatch = responseText.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    var parsed = JSON.parse(jsonMatch[0]);

                    // Validate required fields
                    if (parsed.buzzwords && parsed.answer && parsed.distractors && parsed.teachingPoint) {
                        // Ensure distractors is exactly 2
                        if (!Array.isArray(parsed.distractors)) {
                            parsed.distractors = [String(parsed.distractors), 'N/A'];
                        }
                        while (parsed.distractors.length < 2) {
                            parsed.distractors.push('N/A');
                        }
                        parsed.distractors = parsed.distractors.slice(0, 2);

                        // Ensure buzzwords is an array
                        if (!Array.isArray(parsed.buzzwords)) {
                            parsed.buzzwords = [String(parsed.buzzwords)];
                        }

                        // Default subject if missing
                        if (!parsed.subject || SUBJECTS.indexOf(parsed.subject) < 0) {
                            parsed.subject = 'Multisystem / Mixed';
                        }

                        converted.push(parsed);
                    }
                }
            }
        } catch (e) {
            console.warn('Error converting card ' + (i + 1) + ':', e.message);
        }

        if (onProgress) onProgress(i + 1, cards.length);

        // 500ms delay between API calls to avoid rate limits
        if (i < cards.length - 1) {
            await new Promise(function (resolve) { setTimeout(resolve, 500); });
        }
    }

    return converted;
}

// ===== SAVE TO CUSTOM CARDS =====

/**
 * Save converted cards to the custom cards system.
 *
 * @param {Array} convertedCards
 * @param {object} customCardsModule - The customCards module with an add(cardData) method
 * @returns {number} Count of cards saved
 */
function saveToCustomCards(convertedCards, customCardsModule) {
    var count = 0;

    for (var i = 0; i < convertedCards.length; i++) {
        var card = convertedCards[i];
        try {
            customCardsModule.add({
                subject: card.subject || 'Multisystem / Mixed',
                buzzwords: card.buzzwords || [],
                answer: card.answer || '',
                distractors: card.distractors || ['N/A', 'N/A'],
                teachingPoint: card.teachingPoint || ''
            });
            count++;
        } catch (e) {
            console.warn('Failed to save card:', e.message);
        }
    }

    return count;
}

// ===== UI RENDERING =====

/**
 * Render the Anki import UI section as an HTML string.
 * @returns {string}
 */
function renderAnkiImportUI() {
    return '' +
        '<div class="anki-import-section" style="margin-top:16px;padding:14px;background:var(--bg-card,rgba(30,15,70,.5));border-radius:var(--radius-md,12px);border:var(--border-card,1px solid rgba(187,102,255,.15))">' +
            '<h4 style="margin:0 0 10px;font-size:14px;font-weight:800;color:var(--text-primary,#fff)">📥 Import Anki / CSV Cards</h4>' +

            // File input
            '<label style="font-size:11px;color:var(--text-secondary,#aaa);display:block;margin-bottom:4px">Upload file (.apkg, .csv, .tsv, .txt)</label>' +
            '<input type="file" id="ankiFileInput" accept=".apkg,.csv,.tsv,.txt" ' +
                'style="width:100%;margin-bottom:10px;font-size:12px;color:var(--text-primary,#fff)">' +

            // Textarea
            '<label style="font-size:11px;color:var(--text-secondary,#aaa);display:block;margin-bottom:4px">Or paste tab-separated cards</label>' +
            '<textarea id="ankiPasteArea" rows="6" ' +
                'placeholder="Paste tab-separated cards (front&#9;back per line)..." ' +
                'style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;background:rgba(20,10,50,.6);color:var(--text-primary,#fff);border:1px solid rgba(187,102,255,.2);font-size:12px;resize:vertical"></textarea>' +

            // API Key input
            '<label style="font-size:11px;color:var(--text-secondary,#aaa);display:block;margin:8px 0 4px">API Key (for AI conversion)</label>' +
            '<input type="password" id="ankiApiKeyInput" class="anki-api-key-input" ' +
                'placeholder="OpenAI or Anthropic API key" ' +
                'style="width:100%;box-sizing:border-box;padding:8px;border-radius:8px;background:rgba(20,10,50,.6);color:var(--text-primary,#fff);border:1px solid rgba(187,102,255,.2);font-size:12px;margin-bottom:8px">' +

            // Provider select
            '<label style="font-size:11px;color:var(--text-secondary,#aaa);display:block;margin-bottom:4px">AI Provider</label>' +
            '<select id="ankiProviderSelect" ' +
                'style="width:100%;padding:8px;border-radius:8px;background:rgba(20,10,50,.6);color:var(--text-primary,#fff);border:1px solid rgba(187,102,255,.2);font-size:12px;margin-bottom:12px">' +
                '<option value="openai">OpenAI (gpt-4o-mini)</option>' +
                '<option value="anthropic">Anthropic (Claude Sonnet)</option>' +
            '</select>' +

            // Buttons
            '<button class="btn btn-primary btn-block" id="ankiConvertBtn" ' +
                'style="margin-bottom:6px">🤖 Convert & Import with AI</button>' +
            '<button class="btn btn-outline btn-block" id="ankiRawImportBtn">' +
                '📋 Import Without AI (Raw)</button>' +

            // Progress bar
            '<div class="anki-import-progress" style="margin-top:10px;display:none;height:8px;background:rgba(255,255,255,.1);border-radius:4px;overflow:hidden">' +
                '<div class="anki-import-progress-fill" style="height:100%;width:0%;background:linear-gradient(90deg,var(--accent-cyan,#18ffff),var(--accent-purple,#bb66ff));transition:width 0.3s ease;border-radius:4px"></div>' +
            '</div>' +

            // Status text
            '<div class="anki-import-status" id="ankiImportStatus" style="margin-top:8px;font-size:12px;color:var(--text-secondary,#aaa);text-align:center;min-height:16px"></div>' +
        '</div>';
}

// ===== EVENT BINDING =====

/**
 * Bind click/change handlers for the Anki import UI.
 *
 * @param {HTMLElement} containerElement - The container DOM element
 * @param {object} customCardsModule - The customCards module
 * @param {object} storageModule - The storage module
 */
function bindAnkiEvents(containerElement, customCardsModule, storageModule) {
    if (!containerElement) return;

    var fileInput = containerElement.querySelector('#ankiFileInput');
    var pasteArea = containerElement.querySelector('#ankiPasteArea');
    var apiKeyInput = containerElement.querySelector('#ankiApiKeyInput');
    var providerSelect = containerElement.querySelector('#ankiProviderSelect');
    var convertBtn = containerElement.querySelector('#ankiConvertBtn');
    var rawImportBtn = containerElement.querySelector('#ankiRawImportBtn');
    var progressBar = containerElement.querySelector('.anki-import-progress');
    var progressFill = containerElement.querySelector('.anki-import-progress-fill');
    var statusEl = containerElement.querySelector('#ankiImportStatus');

    // Pre-fill API key from storage
    if (apiKeyInput && storageModule && storageModule.getAnkiApiKey) {
        var savedKey = storageModule.getAnkiApiKey();
        if (savedKey) {
            apiKeyInput.value = savedKey;
        }
    }

    // State: parsed cards from file
    var parsedFileCards = null;

    function setStatus(msg, color) {
        if (statusEl) {
            statusEl.textContent = msg;
            statusEl.style.color = color || 'var(--text-secondary,#aaa)';
        }
    }

    function showProgress(show) {
        if (progressBar) {
            progressBar.style.display = show ? 'block' : 'none';
        }
        if (progressFill) {
            progressFill.style.width = '0%';
        }
    }

    function updateProgress(current, total) {
        if (progressFill && total > 0) {
            var pct = Math.round((current / total) * 100);
            progressFill.style.width = pct + '%';
        }
        setStatus('Processing card ' + current + ' of ' + total + '...');
    }

    /**
     * Get cards from either the file input or the textarea.
     * @returns {Promise<Array<{front: string, back: string}>|null>}
     */
    async function getCards() {
        // If we have parsed file cards, use them
        if (parsedFileCards && parsedFileCards.length > 0) {
            return parsedFileCards;
        }

        // Try textarea
        if (pasteArea && pasteArea.value.trim()) {
            var cards = parseCSV(pasteArea.value);
            if (cards.length > 0) return cards;
        }

        // Try file input
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            var file = fileInput.files[0];
            return await parseFileInput(file);
        }

        return null;
    }

    /**
     * Parse a file input based on extension.
     * @param {File} file
     * @returns {Promise<Array<{front: string, back: string}>>}
     */
    async function parseFileInput(file) {
        var name = file.name.toLowerCase();

        if (name.endsWith('.apkg')) {
            setStatus('Parsing .apkg file (loading libraries)...');
            var cards = await parseApkg(file);
            return cards;
        } else {
            // CSV/TSV/TXT
            var text = await file.text();
            return parseCSV(text);
        }
    }

    // File input change handler
    if (fileInput) {
        fileInput.addEventListener('change', async function () {
            if (!fileInput.files || fileInput.files.length === 0) return;

            var file = fileInput.files[0];
            try {
                setStatus('Reading file...');
                parsedFileCards = await parseFileInput(file);
                setStatus('Parsed ' + parsedFileCards.length + ' cards from file.', 'var(--accent-green,#44ff88)');
            } catch (e) {
                parsedFileCards = null;
                setStatus('Error reading file: ' + e.message, 'var(--accent-red,#ff4466)');
            }
        });
    }

    // Convert & Import button
    if (convertBtn) {
        convertBtn.addEventListener('click', async function () {
            try {
                var apiKey = apiKeyInput ? apiKeyInput.value.trim() : '';
                if (!apiKey) {
                    setStatus('Please enter an API key for AI conversion.', 'var(--accent-red,#ff4466)');
                    return;
                }

                // Save API key
                if (storageModule && storageModule.setAnkiApiKey) {
                    storageModule.setAnkiApiKey(apiKey);
                }

                var provider = providerSelect ? providerSelect.value : 'openai';

                setStatus('Loading cards...');
                var cards = await getCards();

                if (!cards || cards.length === 0) {
                    setStatus('No cards found. Upload a file or paste cards above.', 'var(--accent-red,#ff4466)');
                    return;
                }

                convertBtn.disabled = true;
                showProgress(true);
                setStatus('Converting ' + cards.length + ' cards with AI...');

                var converted = await convertWithAI(cards, apiKey, provider, updateProgress);

                if (converted.length === 0) {
                    setStatus('No cards were successfully converted. Check your API key and try again.', 'var(--accent-red,#ff4466)');
                    convertBtn.disabled = false;
                    showProgress(false);
                    return;
                }

                var savedCount = saveToCustomCards(converted, customCardsModule);

                showProgress(false);
                setStatus('✅ Imported ' + savedCount + ' cards successfully!', 'var(--accent-green,#44ff88)');
                convertBtn.disabled = false;

                // Clear parsed cards
                parsedFileCards = null;

            } catch (e) {
                setStatus('Error: ' + e.message, 'var(--accent-red,#ff4466)');
                convertBtn.disabled = false;
                showProgress(false);
            }
        });
    }

    // Raw Import button
    if (rawImportBtn) {
        rawImportBtn.addEventListener('click', async function () {
            try {
                setStatus('Loading cards...');
                var cards = await getCards();

                if (!cards || cards.length === 0) {
                    setStatus('No cards found. Upload a file or paste cards above.', 'var(--accent-red,#ff4466)');
                    return;
                }

                rawImportBtn.disabled = true;

                var count = 0;
                for (var i = 0; i < cards.length; i++) {
                    try {
                        customCardsModule.add({
                            subject: 'Multisystem / Mixed',
                            buzzwords: [cards[i].front],
                            answer: cards[i].back,
                            distractors: ['N/A', 'N/A'],
                            teachingPoint: cards[i].back
                        });
                        count++;
                    } catch (e) {
                        console.warn('Failed to import raw card:', e.message);
                    }
                }

                setStatus('✅ Raw imported ' + count + ' cards!', 'var(--accent-green,#44ff88)');
                rawImportBtn.disabled = false;

                // Clear parsed cards
                parsedFileCards = null;

            } catch (e) {
                setStatus('Error: ' + e.message, 'var(--accent-red,#ff4466)');
                rawImportBtn.disabled = false;
            }
        });
    }
}

// ===== EXPORTS =====

export var ankiImport = {
    parseCSV: parseCSV,
    parseApkg: parseApkg,
    convertWithAI: convertWithAI,
    saveToCustomCards: saveToCustomCards,
    renderAnkiImportUI: renderAnkiImportUI,
    bindAnkiEvents: bindAnkiEvents
};
