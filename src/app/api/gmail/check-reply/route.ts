import { NextRequest, NextResponse } from 'next/server';
import { getMessage, markAsRead } from '@/lib/gmail';

export async function POST(request: NextRequest) {
  try {
    const { messageId } = await request.json();
    
    if (!messageId) {
      return NextResponse.json(
        { error: 'Message ID is required' },
        { status: 400 }
      );
    }

    const message = await getMessage(messageId);

    if (!message) {
      return NextResponse.json(
        { error: 'Gmail API is not configured' },
        { status: 503 }
      );
    }

    const headers = message.payload?.headers;

    if (!headers) {
      return NextResponse.json(
        { error: 'No headers found in message' },
        { status: 400 }
      );
    }

    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const snippet = message.snippet || '';

    // Check if this is a reply to our emails
    const isReply = subject.toLowerCase().includes('re:') || 
                   subject.toLowerCase().includes('reply') ||
                   from.includes('@gmail.com');

    if (isReply) {
      // Mark as read
      await markAsRead(messageId);
      
      // Here you can add logic to handle the reply
      // For example, send a notification, update a database, etc.
      console.log('Reply detected:', { subject, from, snippet });
    }

    return NextResponse.json({
      success: true,
      isReply,
      subject,
      from,
      snippet
    });
  } catch (error) {
    console.error('Error checking reply:', error);
    return NextResponse.json(
      { error: 'Failed to check reply' },
      { status: 500 }
    );
  }
} 