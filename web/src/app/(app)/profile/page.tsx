import { redirect } from 'next/navigation';

/**
 * S24-NAV-01 — /profile redireciona para /settings?tab=perfil.
 *
 * Antes era uma página duplicada de Settings▸Perfil (dois lugares para a mesma
 * coisa, confuso). A página de perfil canônica é Settings▸Perfil, que tem
 * o formulário de edição + dados somente leitura.
 *
 * Redirect permanente (301-like via Next.js `redirect`).
 */
export default function ProfileRedirect() {
  redirect('/settings?tab=perfil');
}
