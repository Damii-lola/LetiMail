// Frontend/script.js
// Simple JS to call backend endpoints
const generateBtn = document.getElementById('generateBtn');
const recompileBtn = document.getElementById('recompileBtn');
const sendBtn = document.getElementById('sendBtn');
const saveDraftBtn = document.getElementById('saveDraftBtn');

const businessContextEl = document.getElementById('businessContext');
const emailContextEl = document.getElementById('emailContext');
const toneEl = document.getElementById('tone');
const recipientEl = document.getElementById('recipient');
const outputSection = document.getElementById('outputSection');
const generatedEl = document.getElementById('generatedEmail');
const subjectEl = document.getElementById('subject');
const statusEl = document.getElementById('status');

const API_BASE = 'https://letimail-production.up.railway.app/'; // REPLACE with your Railway backend URL

function setStatus(msg, isError=false){
  statusEl.textContent = msg;
  statusEl.style.color = isError ? '#F87171' : '#6B7280';
}

async function generateEmail(useEdits=false){
  setStatus('Generating…');
  const payload = {
    business_context: businessContextEl.value,
    email_context: emailContextEl.value,
    tone: toneEl.value,
    recipient: recipientEl.value || null,
    edits: useEdits ? generatedEl.value : null
  };
  try {
    const res = await fetch(API_BASE + '/generate', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Generation failed');
    subjectEl.value = data.subject || '';
    generatedEl.value = data.body || '';
    outputSection.classList.remove('hidden');
    setStatus('Generated — edit or send.');
  } catch(err){
    console.error(err);
    setStatus('Error: ' + err.message, true);
  }
}

generateBtn.addEventListener('click', ()=> generateEmail(false));
recompileBtn.addEventListener('click', ()=> generateEmail(true));

sendBtn.addEventListener('click', async ()=>{
  setStatus('Sending...');
  const payload = {
    recipient: recipientEl.value,
    subject: subjectEl.value,
    body: generatedEl.value
  };
  try {
    const res = await fetch(API_BASE + '/send', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Send failed');
    setStatus('Email sent ✅');
  } catch(err){
    console.error(err);
    setStatus('Send error: ' + err.message, true);
  }
});

saveDraftBtn.addEventListener('click', async () => {
  setStatus('Saving draft...');
  const payload = {
    subject: subjectEl.value,
    body: generatedEl.value
  };
  try {
    const res = await fetch(API_BASE + '/save-draft', {
      method: 'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Save failed');
    setStatus('Draft saved');
  } catch(err){
    console.error(err);
    setStatus('Save error: ' + err.message, true);
  }
});
