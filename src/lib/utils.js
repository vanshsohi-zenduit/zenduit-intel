import Papa from 'papaparse';


export const extractDomain = (url) => {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname.replace('www.', '');
  } catch {
    return url;
  }
};

export const parseCSV = (text) => {
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  return data.map(row => {
    const norm = {};
    for (const [k, v] of Object.entries(row)) {
      norm[k.trim().toLowerCase().replace(/\s+/g, '_')] = v;
    }
    return norm;
  });
};

export const toCSV = (rows) => {
  if (!rows || rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [
    headers.join(','),
    ...rows.map(row => headers.map(h => `"${(row[h] || '').toString().replace(/"/g, '""')}"`).join(','))
  ].join('\n');
};

export const downloadFile = (content, filename, mimeType = 'text/plain') => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const truncate = (str, length = 100) =>
  str && str.length > length ? str.slice(0, length) + '...' : str;

export const channelColor = (channel) => ({
  LinkedIn: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  Email: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  Call: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  Message: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
}[channel] || 'text-text-secondary bg-white/5 border-glass');

export const scoreColor = (score) => {
  if (score >= 8) return 'text-emerald-400';
  if (score >= 5) return 'text-amber-400';
  return 'text-red-400';
};
