'use server';

import { signIn, signOut } from '@/auth';

export async function loginAction() {
  await signIn('discord', { redirectTo: '/events' });
}

export async function logoutAction() {
  await signOut({ redirectTo: '/' });
}

/** Nur lokal verfuegbar, siehe DEV_LOGIN in auth.js. */
export async function devLoginAction(formData) {
  await signIn('dev-login', {
    discordId: formData.get('discordId') || 'dev-1',
    name: formData.get('name') || 'Testnutzer',
    redirectTo: '/events',
  });
}
