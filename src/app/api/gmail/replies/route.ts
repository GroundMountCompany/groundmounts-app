import { NextRequest, NextResponse } from 'next/server';
import { checkForReplies, markAsRead } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const since = searchParams.get('since');

  try {
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000); // Default to last 24 hours
    const replies = await checkForReplies(sinceDate);
    
    return NextResponse.json({
      success: true,
      replies,
      count: replies.length
    });
  } catch (error) {
    console.error('Error checking for replies:', error);
    return NextResponse.json(
      { error: 'Failed to check for replies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messageId } = await request.json();
    
    if (!messageId) {
      return NextResponse.json(
        { error: 'Message ID is required' },
        { status: 400 }
      );
    }

    await markAsRead(messageId);
    
    return NextResponse.json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    return NextResponse.json(
      { error: 'Failed to mark message as read' },
      { status: 500 }
    );
  }
} 