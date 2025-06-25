import { NextResponse } from 'next/server';
import { checkForReplies } from '@/lib/gmail';

export async function GET() {
  try {
    // Check for replies from the last hour
    const sinceDate = new Date(Date.now() - 60 * 60 * 1000);
    const replies = await checkForReplies(sinceDate);
    
    // Process each reply
    for (const reply of replies) {
      console.log('Processing reply:', {
        id: reply.id,
        subject: reply.subject,
        from: reply.from,
        snippet: reply.snippet
      });
      
      // Here you can add logic to:
      // 1. Send notifications
      // 2. Update CRM
      // 3. Trigger follow-up actions
      // 4. Log to database
    }
    
    return NextResponse.json({
      success: true,
      repliesProcessed: replies.length,
      replies
    });
  } catch (error) {
    console.error('Error in scheduled check:', error);
    return NextResponse.json(
      { error: 'Failed to perform scheduled check' },
      { status: 500 }
    );
  }
}

// This endpoint can be called by a cron job or scheduled task
export async function POST() {
  return GET();
} 