require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// ── Firebase Admin init ────────────────────────────────────────────────────────
// On Render, set FIREBASE_SERVICE_ACCOUNT env var to the full JSON string
// of your Firebase service account key (from Firebase Console → Project Settings
// → Service Accounts → Generate new private key)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
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
