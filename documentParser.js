import fs from 'fs/promises';
import pdf from 'pdf-parse/lib/pdf-parse.js';
import mammoth from 'mammoth';

export async function parseDocument(filePath, mimeType) {
  const buffer = await fs.readFile(filePath);

  if (mimeType === 'application/pdf') {
    return parsePDF(buffer);
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mimeType === 'application/msword') {
    return parseDOCX(buffer);
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
}

async function parsePDF(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    throw new Error('Failed to parse PDF: ' + error.message);
  }
}

async function parseDOCX(buffer) {
  try {
    const result = await mammoth.extractRawText({ buffer: buffer });
    return result.value;
  } catch (error) {
    throw new Error('Failed to parse DOCX: ' + error.message);
  }
}
