import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify'
];

const TOKEN_PATH = path.join(process.cwd(), '.credentials', 'gmail-token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), '.credentials', 'gmail-oauth-client.json');

export function getOAuth2Client(): OAuth2Client {
  try {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.web;
    
    const oAuth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris[0]
    );

    return oAuth2Client;
  } catch (error) {
    console.error('Error loading client secret file:', error);
    throw error;
  }
}

export function getAuthUrl(): string {
  const oAuth2Client = getOAuth2Client();
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
}

export async function getTokens(code: string) {
  const oAuth2Client = getOAuth2Client();
  
  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    
    // Save the token for later use
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log('Token stored to', TOKEN_PATH);
    
    return tokens;
  } catch (error) {
    console.error('Error retrieving access token:', error);
    throw error;
  }
}

export function getAuthenticatedClient(): OAuth2Client {
  const oAuth2Client = getOAuth2Client();
  
  try {
    const token = fs.readFileSync(TOKEN_PATH, 'utf8');
    oAuth2Client.setCredentials(JSON.parse(token));
    return oAuth2Client;
  } catch (error) {
    console.error('Error loading token file:', error);
    throw error;
  }
}

export async function listMessages(query: string = '') {
  const auth = getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  
  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 10
    });
    
    return response.data.messages || [];
  } catch (error) {
    console.error('Error listing messages:', error);
    throw error;
  }
}

export async function getMessage(messageId: string) {
  const auth = getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  
  try {
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId
    });
    
    return response.data;
  } catch (error) {
    console.error('Error getting message:', error);
    throw error;
  }
}

export async function checkForReplies(sinceDate: Date) {
  const auth = getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  
  try {
    const query = `after:${sinceDate.toISOString().split('T')[0]}`;
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 50
    });
    
    const messages = response.data.messages || [];
    const replies = [];
    
    for (const message of messages) {
      const messageData = await getMessage(message.id!);
      const headers = messageData.payload?.headers;
      
      if (headers) {
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const from = headers.find(h => h.name === 'From')?.value || '';
        
        // Check if this is a reply to our emails
        if (subject.toLowerCase().includes('re:') || 
            subject.toLowerCase().includes('reply') ||
            from.includes('@gmail.com')) {
          replies.push({
            id: message.id,
            subject,
            from,
            snippet: messageData.snippet,
            internalDate: messageData.internalDate
          });
        }
      }
    }
    
    return replies;
  } catch (error) {
    console.error('Error checking for replies:', error);
    throw error;
  }
}

export async function markAsRead(messageId: string) {
  const auth = getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });
  
  try {
    await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['UNREAD']
      }
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    throw error;
  }
} 