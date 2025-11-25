// load.js

console.log("load.js loaded");

const EXCHANGE_ADDRESS = "0x080bf510fcbf18b91105470639e9561022937712";
const ERC20_PROXY_ADDRESS = "0x95E6F48254609A6ee006F7D493c8e5fB97094ceF";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const ERC721_PROXY_ID = "0x02571792";
const ERC20_PROXY_ID = "0xf47261b0";

const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 value) returns (bool)"
];

const EXCHANGE_ABI = [
  {
    constant: false,
    inputs: [
      {
        components: [
          { name: "makerAddress", type: "address" },
          { name: "takerAddress", type: "address" },
          { name: "feeRecipientAddress", type: "address" },
          { name: "senderAddress", type: "address" },
          { name: "makerAssetAmount", type: "uint256" },
          { name: "takerAssetAmount", type: "uint256" },
          { name: "makerFee", type: "uint256" },
          { name: "takerFee", type: "uint256" },
          { name: "expirationTimeSeconds", type: "uint256" },
          { name: "salt", type: "uint256" },
          { name: "makerAssetData", type: "bytes" },
          { name: "takerAssetData", type: "bytes" }
        ],
        name: "order",
        type: "tuple"
      },
      { name: "takerAssetFillAmount", type: "uint256" },
      { name: "signature", type: "bytes" }
    ],
    name: "fillOrder",
    outputs: [
      { name: "makerAssetFilledAmount", type: "uint256" },
      { name: "takerAssetFilledAmount", type: "uint256" },
      { name: "feePaid", type: "uint256" }
    ],
    payable: false,
    stateMutability: "nonpayable",
    type: "function"
  }
];

let provider = null;
let signer = null;
let loadedOrder = null;
let loadedSignature = null;

// ---------- Helpers to get DOM elements ----------

function el(id) {
  return document.getElementById(id);
}

// ---------- Parse payload from URL hash ----------

function loadPayloadFromHash() {
  const raw = window.location.hash;
  if (!raw || raw.length <= 1) {
    throw new Error("No swap payload found in URL hash.");
  }

  const decoded = decodeURIComponent(raw.slice(1));
  const payload = JSON.parse(decoded);

  if (!payload.order || !payload.signature) {
    throw new Error("Payload missing order or signature.");
  }

  return payload;
}

// ---------- Decode assetData ----------

function decodeErc721AssetData(assetData) {
  if (!assetData || !assetData.startsWith("0x")) {
    throw new Error("Invalid ERC721 assetData format.");
  }
  const proxyId = assetData.slice(0, 10).toLowerCase(); // 4 bytes + 0x
  if (proxyId !== ERC721_PROXY_ID.toLowerCase()) {
    throw new Error("assetData is not ERC721 type.");
  }
  const data = "0x" + assetData.slice(10);
  const [tokenAddress, tokenId] = ethers.utils.defaultAbiCoder.decode(
    ["address", "uint256"],
    data
  );
  return { tokenAddress, tokenId: tokenId.toString() };
}

function decodeErc20AssetData(assetData) {
  if (!assetData || !assetData.startsWith("0x")) {
    throw new Error("Invalid ERC20 assetData format.");
  }
  const proxyId = assetData.slice(0, 10).toLowerCase();
  if (proxyId !== ERC20_PROXY_ID.toLowerCase()) {
    throw new Error("assetData is not ERC20 type.");
  }
  const data = "0x" + assetData.slice(10);
  const [tokenAddress] = ethers.utils.defaultAbiCoder.decode(
    ["address"],
    data
  );
  return { tokenAddress };
}

// ---------- Human-readable rendering ----------

function formatAddress(addr) {
  if (!addr || addr === "0x0000000000000000000000000000000000000000") {
    return "(any)";
  }
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function formatExpiration(tsStr) {
  const ts = Number(tsStr);
  if (!ts || Number.isNaN(ts)) return "Unknown";
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function formatWethAmountWei(amountStr) {
  // amount is in wei; you want exact decimal
  try {
    const bn = ethers.BigNumber.from(amountStr);
    return ethers.utils.formatUnits(bn, 18) + " WETH";
  } catch {
    return amountStr + " wei WETH";
  }
}

// ---------- Show order in UI ----------

function populateUi(order, signature) {
  // Basic maker / taker
  el("maker").textContent = formatAddress(order.makerAddress);
  el("taker").textContent = formatAddress(order.takerAddress);
  el("expires").textContent = formatExpiration(order.expirationTimeSeconds);

  // Decode maker asset (ERC721)
  let makerDesc = "";
  try {
    const { tokenAddress, tokenId } = decodeErc721AssetData(
      order.makerAssetData
    );
    makerDesc = `ERC721 at ${formatAddress(
      tokenAddress
    )} #${tokenId} (amount: ${order.makerAssetAmount})`;
  } catch (e) {
    console.warn("Failed to decode makerAssetData as ERC721:", e);
    makerDesc = `Raw assetData: ${order.makerAssetData}`;
  }
  el("maker-asset").textContent = makerDesc;

  // Decode taker asset (ERC20, expected WETH)
  let takerDesc = "";
  try {
    const { tokenAddress } = decodeErc20AssetData(order.takerAssetData);
    const isWeth =
      tokenAddress.toLowerCase() === WETH_ADDRESS.toLowerCase();
    const amt = formatWethAmountWei(order.takerAssetAmount);
    takerDesc = isWeth
      ? `${amt} (1 wei) from WETH at ${formatAddress(tokenAddress)}`
      : `ERC20 at ${formatAddress(tokenAddress)} amount: ${order.takerAssetAmount}`;
  } catch (e) {
    console.warn("Failed to decode takerAssetData as ERC20:", e);
    takerDesc = `Raw assetData: ${order.takerAssetData}`;
  }
  el("taker-asset").textContent = takerDesc;

  // Raw JSON
  el("raw-json").textContent = JSON.stringify(
    { order, signature },
    null,
    2
  );
}

// ---------- Wallet / provider helpers ----------

async function getProviderAndSigner() {
  if (!window.ethereum) {
    throw new Error("No Ethereum wallet (window.ethereum) found.");
  }

  if (!provider) {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
  }
  if (!signer) {
    await provider.send("eth_requestAccounts", []);
    signer = provider.getSigner();
  }
  return { provider, signer };
}

// ---------- Fill logic ----------

async function ensureWethApproval(takerAddress, tokenAddress, amountWei) {
  const { signer } = await getProviderAndSigner();
  const erc20 = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

  const currentAllowance = await erc20.allowance(
    takerAddress,
    ERC20_PROXY_ADDRESS
  );

  if (currentAllowance.gte(amountWei)) {
    console.log("Sufficient WETH allowance already set.");
    return;
  }

  const want = ethers.constants.MaxUint256;

  if (
    !window.confirm(
      `WETH allowance to 0x ERC20 proxy is too low.\n\n` +
        `Current allowance: ${currentAllowance.toString()} wei\n` +
        `Required at least: ${amountWei.toString()} wei\n\n` +
        `Do you want to approve unlimited WETH to the 0x ERC20 proxy?`
    )
  ) {
    throw new Error("User declined WETH approval.");
  }

  const tx = await erc20.approve(ERC20_PROXY_ADDRESS, want);
  console.log("Approve tx sent:", tx.hash);
  alert("WETH approve transaction sent:\n" + tx.hash);
  await tx.wait();
  console.log("Approve tx confirmed.");
}

async function fillSwap() {
  const btn = el("fill-btn");
  btn.disabled = true;
  btn.textContent = "Filling…";

  try {
    if (!loadedOrder || !loadedSignature) {
      throw new Error("No order loaded.");
    }

    const { provider, signer } = await getProviderAndSigner();
    const takerAddr = (await signer.getAddress()).toLowerCase();

    if (takerAddr !== loadedOrder.takerAddress.toLowerCase()) {
      throw new Error(
        `Wrong wallet connected. This swap is only for ${loadedOrder.takerAddress}.`
      );
    }

    // Decode taker asset (ERC20)
    const { tokenAddress } = decodeErc20AssetData(
      loadedOrder.takerAssetData
    );
    const takerAmount = ethers.BigNumber.from(
      loadedOrder.takerAssetAmount
    );

    // Ensure WETH approval to ERC20 proxy
    await ensureWethApproval(takerAddr, tokenAddress, takerAmount);

    // Build order struct for 0x Exchange
    const orderStruct = {
      makerAddress: loadedOrder.makerAddress,
      takerAddress: loadedOrder.takerAddress,
      feeRecipientAddress: loadedOrder.feeRecipientAddress,
      senderAddress: loadedOrder.senderAddress,
      makerAssetAmount: loadedOrder.makerAssetAmount,
      takerAssetAmount: loadedOrder.takerAssetAmount,
      makerFee: loadedOrder.makerFee,
      takerFee: loadedOrder.takerFee,
      expirationTimeSeconds: loadedOrder.expirationTimeSeconds,
      salt: loadedOrder.salt,
      makerAssetData: loadedOrder.makerAssetData,
      takerAssetData: loadedOrder.takerAssetData
    };

    const exchange = new ethers.Contract(
      EXCHANGE_ADDRESS,
      EXCHANGE_ABI,
      signer
    );

    console.log("Calling fillOrder with:", orderStruct, takerAmount.toString(), loadedSignature);

    const tx = await exchange.fillOrder(
      orderStruct,
      takerAmount,
      loadedSignature
      // you can optionally set gasLimit here if estimation fails
      // { gasLimit: 300000 }
    );

    console.log("fillOrder tx sent:", tx.hash);
    alert("fillOrder transaction sent:\n" + tx.hash);

    const receipt = await tx.wait();
    console.log("fillOrder confirmed:", receipt.transactionHash);
    alert("Swap filled successfully!");
  } catch (err) {
    console.error("Fill swap error:", err);
    alert("Error while filling swap: " + (err?.message || err));
  } finally {
    btn.disabled = false;
    btn.textContent = "Fill This Swap";
  }
}

// ---------- Init ----------

async function init() {
  try {
    const payload = loadPayloadFromHash();
    loadedOrder = payload.order;
    loadedSignature = payload.signature;

    populateUi(loadedOrder, loadedSignature);
  } catch (err) {
    console.error("Error loading swap from URL:", err);
    el("raw-json").textContent =
      "Error loading swap: " + (err?.message || err);
    el("fill-btn").disabled = true;
    return;
  }

  el("fill-btn").addEventListener("click", fillSwap);
}

init();
