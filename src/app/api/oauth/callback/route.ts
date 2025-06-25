import { NextRequest, NextResponse } from 'next/server';
import { getTokens } from '@/lib/gmail';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: 'Authorization failed' }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
  }

  try {
    const tokens = await getTokens(code);
    
    return NextResponse.json({
      success: true,
      message: 'Gmail OAuth authentication successful',
      tokens
    });
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    return NextResponse.json(
      { error: 'Failed to exchange code for tokens' },
      { status: 500 }
    );
  }
} 