import { google } from 'googleapis';
import type { Clinic } from '@prisma/client';
import { env } from '../config/env.js';

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

export function makeOAuth2Client() {
  return new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
}

export function getAuthUrl(clinicId: string): string {
  const oauth2 = makeOAuth2Client();
  return oauth2.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state: clinicId,
  });
}

export async function exchangeCode(code: string) {
  const oauth2 = makeOAuth2Client();
  const { tokens } = await oauth2.getToken(code);
  return tokens;
}

/** Returns an authorized calendar client for a clinic with a refresh token. */
export function getCalendarFor(clinic: Pick<Clinic, 'googleRefreshToken'>) {
  if (!clinic.googleRefreshToken) {
    throw new Error('Clinic has not connected Google Calendar');
  }
  const oauth2 = makeOAuth2Client();
  oauth2.setCredentials({ refresh_token: clinic.googleRefreshToken });
  return google.calendar({ version: 'v3', auth: oauth2 });
}
