import {
  Account,
  Connection,
  Transaction,
  clusterApiUrl,
  LAMPORTS_PER_SOL,
  SystemProgram,
} from "@solana/web3.js";
import { Token, MintLayout, AccountLayout } from "@solana/spl-token";
import { DEVNET_SPL_TOKEN_PROGRAM } from "../constants";
import { Repro } from "./reproInstruction";

export async function repro() {
  const connection = new Connection(clusterApiUrl("devnet"));

  let instructions = [];
  const PRECISION = 9;

  const adminAccount = new Account();
  console.log(`Admin Account: ${adminAccount.publicKey.toBase58()}`);
  const airdropTx = await connection.requestAirdrop(adminAccount.publicKey, 2*LAMPORTS_PER_SOL);
  console.log(`Airdrop tx: ${airdropTx}`);

  await connection.confirmTransaction(airdropTx, 'singleGossip');

  const authority = adminAccount.publicKey;
  const owner = adminAccount.publicKey;
  const payer = adminAccount.publicKey;

  const mintAccount = await newMint(connection, instructions, PRECISION, authority, owner);
  console.log(`Mint: ${mintAccount.publicKey.toBase58()}`);

  const tokenAccount = await newTokenAccount(connection, instructions, mintAccount.publicKey, owner, payer);
  console.log(`Token Account: ${tokenAccount.publicKey.toBase58()}`);

  // mint 100 tokens
  instructions.push(Token.createMintToInstruction(DEVNET_SPL_TOKEN_PROGRAM, mintAccount.publicKey, tokenAccount.publicKey, authority, [], 100 * Math.pow(10, PRECISION)));

  instructions.push(Repro.createInitializeTokenInstruction(
    adminAccount,
    tokenAccount.publicKey
  ));

  await sendTransaction(connection, null, instructions, [adminAccount, mintAccount, tokenAccount], true);

  console.log("Tx succeeded.");
}


export const sendTransaction = async (
  connection,
  wallet,
  instructions,
  signers,
  awaitConfirmation = true
) => {
  let transaction = new Transaction();
  instructions.forEach((instruction) => transaction.add(instruction));
  transaction.recentBlockhash = (
    await connection.getRecentBlockhash("max")
  ).blockhash;
  if(wallet) {
    transaction.setSigners(
      // fee payied by the wallet owner
      wallet.publicKey,
      ...signers.map((s) => s.publicKey)
    );
  } else {
    transaction.setSigners(
      ...signers.map((s) => s.publicKey)
    );
  }
  if (signers.length > 0) {
    transaction.partialSign(...signers);
  }
  if(wallet) {
    transaction = await wallet.signTransaction(transaction);
  }
  const rawTransaction = transaction.serialize();
  let options = {
    skipPreflight: true,
    commitment: "max",
  };

  const txid = await connection.sendRawTransaction(rawTransaction, options);

  console.log(`Transaction id: ${txid}`)

  if (awaitConfirmation) {
    const status = (
      await connection.confirmTransaction(
        txid,
        options && (options.commitment)
      )
    ).value;

    if (status?.err) {
            throw new Error(
        `Raw transaction ${txid} failed (${JSON.stringify(status)})`
      );
    }
  }

  return txid;
};

async function newMint(connection, instructions, PRECISION, authority, payer) {
  const account = new Account();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(
        MintLayout.span
      ),
      space: MintLayout.span,
      programId: DEVNET_SPL_TOKEN_PROGRAM,
    })
  );


  instructions.push(
    Token.createInitMintInstruction(
      DEVNET_SPL_TOKEN_PROGRAM,
      account.publicKey,
      PRECISION,
      // pass control of liquidity mint to swap program
      authority,
      // swap program can freeze liquidity token mint
      null
    )
  );

  return account;
}

async function newTokenAccount(connection, instructions, mint, owner, payer) {
  const account = new Account();
  instructions.push(
    SystemProgram.createAccount({
      fromPubkey: payer,
      newAccountPubkey: account.publicKey,
      lamports: await connection.getMinimumBalanceForRentExemption(
        AccountLayout.span
      ),
      space: AccountLayout.span,
      programId: DEVNET_SPL_TOKEN_PROGRAM,
    })
  );

  instructions.push(
    Token.createInitAccountInstruction(
      DEVNET_SPL_TOKEN_PROGRAM,
      mint,
      account.publicKey,
      owner
    )
  );
  return account;
}

