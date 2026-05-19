require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// ── Firebase Admin init ────────────────────────────────────────────────────────
// Set these three env vars on Render (copy values from your service account JSON):
//   FIREBASE_PROJECT_ID   → "project_id" field
//   FIREBASE_CLIENT_EMAIL → "client_email" field
//   FIREBASE_PRIVATE_KEY  → "private_key" field (paste the whole -----BEGIN...END----- block)
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Render escapes \n as \\n in env vars — this converts them back
    privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

const db = admin.firestore();

// ── Health check ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.send('HandyGo M-Pesa server is running'));

// ── M-Pesa STK callback ────────────────────────────────────────────────────────
// Daraja posts here when the client completes or cancels the payment prompt
app.post('/mpesa/callback', async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;
    if (!callback) return res.status(400).json({ error: 'Invalid payload' });

    const { CheckoutRequestID, ResultCode } = callback;
    const status = ResultCode === 0 ? 'paid' : 'failed';

    // Find the job that has this checkoutRequestId
    const snap = await db
      .collection('jobs')
      .where('checkoutRequestId', '==', CheckoutRequestID)
      .limit(1)
      .get();

    if (!snap.empty) {
      await snap.docs[0].ref.update({ paymentStatus: status });
      console.log(`Job ${snap.docs[0].id} → paymentStatus: ${status}`);
    } else {
      console.warn('No job found for CheckoutRequestID:', CheckoutRequestID);
    }

    // Daraja requires a 200 with this shape
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('Callback error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
