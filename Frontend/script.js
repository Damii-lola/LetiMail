const API_BASE = 'https://aipersonalcommunicator.vercel.app//api';

const generateBtn = document.getElementById('generateBtn');
const sendBtn = document.getElementById('sendBtn');
const output = document.getElementById('output');

generateBtn.addEventListener('click', async () => {
  const business = document.getElementById('business').value.trim();
  const context = document.getElementById('context').value.trim();
  const tone = document.getElementById('tone').value;

  if (!business || !context) {
    alert('Please fill in both text areas.');
    return;
  }

  generateBtn.innerText = 'Generating...';
  generateBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_context: business, email_context: context, tone })
    });
    const data = await res.json();

    document.getElementById('subject').value = data.subject || '';
    document.getElementById('body').value = data.body || '';
    output.classList.remove('hidden');
  } catch (err) {
    console.error(err);
    alert('Error generating email.');
  } finally {
    generateBtn.innerText = 'Generate Email';
    generateBtn.disabled = false;
  }
});

sendBtn.addEventListener('click', async () => {
  const recipient = document.getElementById('recipient').value.trim();
  const subject = document.getElementById('subject').value.trim();
  const body = document.getElementById('body').value.trim();

  if (!recipient || !subject || !body) {
    alert('Please fill all fields before sending.');
    return;
  }

  sendBtn.innerText = 'Sending...';
  sendBtn.disabled = true;

  try {
    const res = await fetch(`${API_BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, subject, body, user_id: 'anon' })
    });
    if (res.ok) alert('Email sent successfully!');
    else alert('Error sending email.');
  } catch (err) {
    console.error(err);
    alert('Error sending email.');
  } finally {
    sendBtn.innerText = 'Send Email';
    sendBtn.disabled = false;
  }
});
