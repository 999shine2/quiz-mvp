/**
 * clientParser.js — Client-Side Document Parsing
 * Parses PDF and DOCX files entirely in the browser.
 * Uses PDF.js (CDN) and mammoth.js (CDN).
 */
const clientParser = (() => {

    // ── Parse a File object ───────────────────────────────────
    async function parseFile(file) {
        if (!file) throw new Error('No file provided');

        const mimeType = file.type;
        const arrayBuffer = await file.arrayBuffer();

        if (mimeType === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
            return await parsePDF(arrayBuffer);
        } else if (
            mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
            mimeType === 'application/msword' ||
            file.name.toLowerCase().endsWith('.docx') ||
            file.name.toLowerCase().endsWith('.doc')
        ) {
            return await parseDOCX(arrayBuffer);
        } else if (mimeType.startsWith('text/') || file.name.toLowerCase().endsWith('.txt')) {
            const decoder = new TextDecoder('utf-8');
            return decoder.decode(arrayBuffer);
        } else {
            throw new Error(`Unsupported file type: ${mimeType || file.name}`);
        }
    }

    // ── Parse PDF using PDF.js ────────────────────────────────
    async function parsePDF(arrayBuffer) {
        if (typeof pdfjsLib === 'undefined') {
            throw new Error('PDF.js library not loaded. Please check your internet connection.');
        }

        try {
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';

            console.log(`[ClientParser] Parsing PDF: ${pdf.numPages} pages`);

            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += pageText + '\n';
            }

            if (!fullText.trim()) {
                throw new Error('PDF appears to contain no extractable text (may be scanned/image-based).');
            }

            console.log(`[ClientParser] PDF parsed: ${fullText.length} chars`);
            return fullText;
        } catch (error) {
            throw new Error('Failed to parse PDF: ' + error.message);
        }
    }

    // ── Parse DOCX using mammoth.js ───────────────────────────
    async function parseDOCX(arrayBuffer) {
        if (typeof mammoth === 'undefined') {
            throw new Error('mammoth.js library not loaded. Please check your internet connection.');
        }

        try {
            const result = await mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            const text = result.value;

            if (!text.trim()) {
                throw new Error('DOCX appears to contain no text.');
            }

            console.log(`[ClientParser] DOCX parsed: ${text.length} chars`);
            return text;
        } catch (error) {
            throw new Error('Failed to parse DOCX: ' + error.message);
        }
    }

    // ── Check if libraries are loaded ─────────────────────────
    function isReady() {
        return {
            pdf: typeof pdfjsLib !== 'undefined',
            docx: typeof mammoth !== 'undefined'
        };
    }

    // ── Public API ────────────────────────────────────────────
    return {
        parseFile,
        parsePDF,
        parseDOCX,
        isReady
    };
})();
