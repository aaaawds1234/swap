const EXCHANGE_ADDRESS = "0x080bf510fcbf18b91105470639e9561022937712";
const ERC20_PROXY_ADDRESS = "0x95E6F48254609A6ee006F7D493c8e5fB97094ceF";
const WETH_ADDRESS = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const ERC721_PROXY_ID = "0x02571792";
const ERC20_PROXY_ID  = "0xf47261b0";
const MULTI_ASSET_PROXY_ID = "0x94cfcdd7";

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

// ---------- helpers ----------

function el(id) {
  return document.getElementById(id);
}

// encoding helpers (same idea as in create.js)
function encodeErc721AssetData(tokenAddress, tokenId) {
  const encodedParams = ethers.utils.defaultAbiCoder.encode(
    ["address", "uint256"],
    [tokenAddress, tokenId]
  );
  return ERC721_PROXY_ID + encodedParams.slice(2);
}

function encodeErc20AssetData(tokenAddress) {
  const encodedParams = ethers.utils.defaultAbiCoder.encode(
    ["address"],
    [tokenAddress]
  );
  return ERC20_PROXY_ID + encodedParams.slice(2);
}

function encodeMultiAssetData(amounts, nestedAssetDatas) {
  if (amounts.length !== nestedAssetDatas.length) {
    throw new Error("MultiAsset: amounts and assetDatas length mismatch.");
  }

  const bnAmounts = amounts.map(a => ethers.BigNumber.from(a));
  const encodedParams = ethers.utils.defaultAbiCoder.encode(
    ["uint256[]", "bytes[]"],
    [bnAmounts, nestedAssetDatas]
  );

  return MULTI_ASSET_PROXY_ID + encodedParams.slice(2);
}

// decoding helpers (for display)
function decodeErc721AssetData(assetData) {
  if (!assetData || !assetData.startsWith("0x")) {
    throw new Error("Invalid ERC721 assetData format.");
  }
  const proxyId = assetData.slice(0, 10).toLowerCase();
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
  const [tokenAddress] = ethers.utils.defaultAbiCoder.decode(["address"], data);
  return { tokenAddress };
}

function decodeMultiAssetData(assetData) {
  if (!assetData || !assetData.startsWith("0x")) {
    throw new Error("Invalid MultiAsset assetData format.");
  }
  const proxyId = assetData.slice(0, 10).toLowerCase();
  if (proxyId !== MULTI_ASSET_PROXY_ID.toLowerCase()) {
    throw new Error("assetData is not MultiAsset type.");
  }
  const data = "0x" + assetData.slice(10);
  const [amounts, nestedAssetDatas] = ethers.utils.defaultAbiCoder.decode(
    ["uint256[]", "bytes[]"],
    data
  );
  return {
    amounts: amounts.map(a => a.toString()),
    nestedAssetDatas
  };
}

// ---------- load payload from URL ----------

/**
 * Supports:
 * 1) Legacy: { order, signature }
 * 2) Compact v1:
 *    {
 *      v: 1,
 *      maker, taker, feeRecipient, sender,
 *      makerAmount, takerAmount,
 *      expiration, salt,
 *      collection,
 *      tokenIds: [ "123", "456", ... ],
 *      takerAsset: { type: "erc20", token, amount },
 *      sig
 *    }
 */
function loadPayloadFromHash() {
  const raw = window.location.hash;
  if (!raw || raw.length <= 1) {
    throw new Error("No swap payload found in URL hash.");
  }

  const decoded = decodeURIComponent(raw.slice(1));
  const payload = JSON.parse(decoded);

  // Case 1: full order already present
  if (payload.order && payload.signature) {
    return {
      order: payload.order,
      signature: payload.signature
    };
  }

  // Case 2: compact v1 format
  if (payload.v === 1 && payload.collection && Array.isArray(payload.tokenIds)) {
    const makerAddress       = payload.maker;
    const takerAddress       = payload.taker;
    const feeRecipient       = payload.feeRecipient || "0x0000000000000000000000000000000000000000";
    const sender             = payload.sender      || "0x0000000000000000000000000000000000000000";
    const makerAssetAmount   = payload.makerAmount;
    const takerAssetAmount   = payload.takerAmount;
    const expiration         = payload.expiration;
    const salt               = payload.salt;
    const collection         = payload.collection;

    const takerTokenAddress  =
      (payload.takerAsset && payload.takerAsset.token) || WETH_ADDRESS;

    const tokenIds = payload.tokenIds.map(id => id.toString());

    // rebuild MultiAsset -> makerAssetData
    const nestedAssetDatas = tokenIds.map(id =>
      encodeErc721AssetData(collection, id)
    );
    const amounts = tokenIds.map(() => "1");
    const makerAssetData = encodeMultiAssetData(amounts, nestedAssetDatas);

    // rebuild takerAssetData
    const takerAssetData = encodeErc20AssetData(takerTokenAddress);

    const order = {
      makerAddress,
      takerAddress,
      feeRecipientAddress: feeRecipient,
      senderAddress: sender,
      makerAssetAmount,
      takerAssetAmount,
      makerFee: "0",
      takerFee: "0",
      expirationTimeSeconds: expiration,
      salt,
      makerAssetData,
      takerAssetData
    };

    return {
      order,
      signature: payload.sig
    };
  }

  throw new Error("Unrecognized swap payload format in URL.");
}

// ---------- formatting helpers for UI ----------

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
  try {
    const bn = ethers.BigNumber.from(amountStr);
    return ethers.utils.formatUnits(bn, 18) + " WETH";
  } catch {
    return amountStr + " wei WETH";
  }
}

function populateUi(order, signature) {
  el("maker").textContent = formatAddress(order.makerAddress);
  el("taker").textContent = formatAddress(order.takerAddress);
  el("expires").textContent = formatExpiration(order.expirationTimeSeconds);

  // Maker asset: support MultiAsset (basket of ERC721s) and plain ERC721
  let makerDesc = "";
  try {
    const proxyId = order.makerAssetData.slice(0, 10).toLowerCase();

    if (proxyId === MULTI_ASSET_PROXY_ID.toLowerCase()) {
      const { nestedAssetDatas } = decodeMultiAssetData(order.makerAssetData);
      const decodedNfts = nestedAssetDatas.map(ad => decodeErc721AssetData(ad));
      const count = decodedNfts.length;

      let collection = "(unknown)";
      if (count > 0) {
        collection = decodedNfts[0].tokenAddress;
      }
      const ids = decodedNfts.map(n => n.tokenId).join(", ");

      makerDesc =
        `${count} ERC721s from ${formatAddress(collection)} ` +
        `(ids: ${ids})`;
    } else if (proxyId === ERC721_PROXY_ID.toLowerCase()) {
      const { tokenAddress, tokenId } = decodeErc721AssetData(order.makerAssetData);
      makerDesc =
        `ERC721 at ${formatAddress(tokenAddress)} ` +
        `#${tokenId} (amount: ${order.makerAssetAmount})`;
    } else {
      makerDesc = `Raw assetData: ${order.makerAssetData}`;
    }
  } catch (e) {
    console.warn("Failed to decode makerAssetData:", e);
    makerDesc = `Raw assetData: ${order.makerAssetData}`;
  }
  el("maker-asset").textContent = makerDesc;

  // Taker asset: ERC20 (WETH)
  let takerDesc = "";
  try {
    const { tokenAddress } = decodeErc20AssetData(order.takerAssetData);
    const isWeth =
      tokenAddress.toLowerCase() === WETH_ADDRESS.toLowerCase();
    const amt = formatWethAmountWei(order.takerAssetAmount);
    takerDesc = isWeth
      ? `${amt} from WETH at ${formatAddress(tokenAddress)}`
      : `ERC20 at ${formatAddress(tokenAddress)} amount: ${order.takerAssetAmount}`;
  } catch (e) {
    console.warn("Failed to decode takerAssetData as ERC20:", e);
    takerDesc = `Raw assetData: ${order.takerAssetData}`;
  }
  el("taker-asset").textContent = takerDesc;

  el("raw-json").textContent = JSON.stringify(
    { order, signature },
    null,
    2
  );
}

// ---------- wallet + fill logic ----------

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

    const { tokenAddress } = decodeErc20AssetData(
      loadedOrder.takerAssetData
    );
    const takerAmount = ethers.BigNumber.from(
      loadedOrder.takerAssetAmount
    );

    await ensureWethApproval(takerAddr, tokenAddress, takerAmount);

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

    console.log(
      "Calling fillOrder with:",
      orderStruct,
      takerAmount.toString(),
      loadedSignature
    );

    const tx = await exchange.fillOrder(
      orderStruct,
      takerAmount,
      loadedSignature
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

// ---------- init ----------

async function init() {
  try {
    const { order, signature } = loadPayloadFromHash();
    loadedOrder = order;
    loadedSignature = signature;

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
