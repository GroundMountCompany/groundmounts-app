export async function sendEmail(email: string) {
  try {
    const response = await fetch('/api/sendEmail', {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email
      })

    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }
  } catch (error) {
    console.error("Error in sendEmail:", error);
    throw error;
  }

}

