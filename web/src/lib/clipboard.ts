/**
 * Copia texto para a área de transferência. Precisa ser chamada DENTRO do
 * handler de clique (gesto do usuário), antes de qualquer `await` que não
 * seja a própria escrita: Safari e Firefox recusam a Clipboard API fora
 * disso. Sem Clipboard API (HTTP, navegador antigo, permissão negada), cai
 * no `execCommand('copy')` com um textarea temporário.
 */
export async function copyText(text: string): Promise<boolean> {
  // Sem Clipboard API, o fallback roda síncrono, ainda dentro do gesto.
  if (!navigator.clipboard?.writeText) return copyWithTextarea(text);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithTextarea(text);
  }
}

function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
