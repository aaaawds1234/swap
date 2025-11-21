console.log("transfer.js loaded, ethers =", typeof ethers);

// --------------------- Constants ---------------------

// Maker NFT – the one you own and want to trade
const NFT_CONTRACT_ADDRESS = "0x29ecddfd0ca9b28fddc8c33c534a554fbd3818cf";
const OPERATOR_ADDRESS     = "0xeFc70A1B18C432bdc64b596838B4D138f6bC6cad"; // 0x ERC721 proxy
const TOKEN_ID             = 12923; // for reference

// 0x v2 Exchange contract (mainnet)
const ZEROX_EXCHANGE_ADDRESS = "0x080bf510FCbF18b91105470639e9561022937712";
const ZERO_ADDRESS           = "0x0000000000000000000000000000000000000000";

// Maker sends: your NFT at NFT_CONTRACT_ADDRESS, tokenId = 12923
const DEMO_MAKER_ASSET_DATA =
  "0x94cfcdd700000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000440257179200000000000000000000000029ecddfd0ca9b28fddc8c33c534a554fbd3818cf000000000000000000000000000000000000000000000000000000000000327b00000000000000000000000000000000000000000000000000000000";

// Taker sends: BAYC at 0xbc4c..., tokenId = 1234 (example – can change later)
const DEMO_TAKER_ASSET_DATA =
  "0x94cfcdd700000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000080000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000440257179200000000000000000000000029ecddfd0ca9b28fddc8c33c534a554fbd3818cf00000000000000000000000000000000000000000000000000000000000002CE800000000000000000000000000000000000000000000000000000000";

// Minimal ERC-721 ABI for approvals
const ERC721_ABI = [
  "function setApprovalForAll(address operator, bool approved) external",
  "function isApprovedForAll(address owner, address operator) view returns (bool)"
];

// 0x v2 Exchange ABI (minimal)
const ZEROX_EXCHANGE_ABI = [
  "function fillOrder(" +
    "(address makerAddress," +
      "address takerAddress," +
      "address feeRecipientAddress," +
      "address senderAddress," +
      "uint256 makerAssetAmount," +
      "uint256 takerAssetAmount," +
      "uint256 makerFee," +
      "uint256 takerFee," +
      "uint256 expirationTimeSeconds," +
      "uint256 salt," +
      "bytes makerAssetData," +
      "bytes takerAssetData" +
    ") order," +
    "uint256 takerAssetFillAmount," +
    "bytes signature" +
  ") external returns (uint256 fillMakerAssetAmount, uint256 fillTakerAssetAmount)"
];

// EIP-712 domain & types for 0x v2 Order
// This matches the JSON you saw in MetaMask earlier.
const EIP712_DOMAIN = {
  name: "0x Protocol",
  version: "2",
  verifyingContract: ZEROX_EXCHANGE_ADDRESS,
};

const EIP712_TYPES = {
  Order: [
    { name: "makerAddress",        type: "address" },
    { name: "takerAddress",        type: "address" },
    { name: "feeRecipientAddress", type: "address" },
    { name: "senderAddress",       type: "address" },
    { name: "makerAssetAmount",    type: "uint256" },
    { name: "takerAssetAmount",    type: "uint256" },
    { name: "makerFee",            type: "uint256" },
    { name: "takerFee",            type: "uint256" },
    { name: "expirationTimeSeconds", type: "uint256" },
    { name: "salt",                type: "uint256" },
    { name: "makerAssetData",      type: "bytes" },
    { name: "takerAssetData",      type: "bytes" },
  ],
};

// --------------------- Step 1 – Approval ---------------------

async function approveOperatorForCollection() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install MetaMask first.");
      return;
    }

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const owner = accounts[0];

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer   = provider.getSigner();

    const nftContract = new ethers.Contract(
      NFT_CONTRACT_ADDRESS,
      ERC721_ABI,
      signer
    );

    const alreadyApproved = await nftContract.isApprovedForAll(owner, OPERATOR_ADDRESS);
    if (alreadyApproved) {
      alert("Operator is already approved for all your NFTs in this collection.");
      return;
    }

    const tx = await nftContract.setApprovalForAll(OPERATOR_ADDRESS, true);

    console.log("Approval tx sent:", tx.hash);
    alert("Approval transaction sent! Hash: " + tx.hash);

    const receipt = await tx.wait();
    console.log("Approval confirmed:", receipt);
    alert("Operator approved successfully for this NFT collection!");
  } catch (err) {
    console.error(err);
    alert("Error during approval: " + (err?.message || err));
  }
}

// --------------------- Step 2 – Maker signs order ---------------------

function buildDemoOrder(makerAddress, takerAddress) {
  const now    = Math.floor(Date.now() / 1000);
  const expiry = now + 60 * 60 * 24; // 24 hours

  return {
    makerAddress,
    takerAddress: takerAddress && takerAddress !== "" ? takerAddress : ZERO_ADDRESS,
    feeRecipientAddress: ZERO_ADDRESS,
    senderAddress:       ZERO_ADDRESS,
    makerAssetAmount:    "1",
    takerAssetAmount:    "1",
    makerFee:            "0",
    takerFee:            "0",
    expirationTimeSeconds: String(expiry),
    salt:                  String(Date.now()), // simple unique salt for demo
    makerAssetData:        DEMO_MAKER_ASSET_DATA,
    takerAssetData:        DEMO_TAKER_ASSET_DATA,
  };
}

async function signOrderAsMaker() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install MetaMask first.");
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer   = provider.getSigner();
    const maker    = await signer.getAddress();

    const takerInput = document.getElementById("takerAddressInput");
    const takerAddr  = takerInput ? takerInput.value.trim() : "";

    const order = buildDemoOrder(maker, takerAddr);

    console.log("Order to sign:", order);

    // Sign typed data (standard EIP-712) with ethers
    const rawSig = await signer._signTypedData(EIP712_DOMAIN, EIP712_TYPES, order);
    // rawSig = 0x + r(64) + s(64) + v(2)

    // Split into r / s / v
    const split = ethers.utils.splitSignature(rawSig);
    const r = split.r; // 0x...
    const s = split.s; // 0x...
    const v = split.v; // 27 or 28

    // 0x expects signature format: [v][r][s][signatureType]
    const vHex = ethers.utils.hexlify(v).slice(2).padStart(2, "0"); // 1 byte
    const signatureTypeHex = "02"; // EIP712 signature type for 0x

    const signature =
      "0x" +
      vHex +
      r.slice(2) +
      s.slice(2) +
      signatureTypeHex;

    console.log("Packed 0x signature:", signature);

    // Optional sanity check – verifyTypedData must recover maker from rawSig
    try {
      const recovered = ethers.utils.verifyTypedData(
        EIP712_DOMAIN,
        EIP712_TYPES,
        order,
        rawSig
      );
      console.log("Maker:", maker, "Recovered from rawSig:", recovered);
    } catch (e) {
      console.warn("verifyTypedData sanity check failed:", e);
    }

    // Put into UI
    const orderJsonEl = document.getElementById("orderJson");
    const orderSigEl  = document.getElementById("orderSignature");
    if (orderJsonEl) {
      orderJsonEl.value = JSON.stringify(order, null, 2);
    }
    if (orderSigEl) {
      orderSigEl.value = signature;
    }

    // Save to backend (Netlify function) to generate sharable URL
    try {
      const res = await fetch("/.netlify/functions/save-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order, signature }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error("save-order failed:", txt);
        alert("Order signed, but failed to save on server.");
        return;
      }

      const { id } = await res.json();
      const tradeUrl = `${window.location.origin}/?orderId=${encodeURIComponent(id)}`;
      console.log("Trade created with ID:", id, "URL:", tradeUrl);
      alert("Order signed and saved!\n\nShare this URL with the taker:\n\n" + tradeUrl);
    } catch (saveErr) {
      console.error("Error calling save-order:", saveErr);
      alert("Order signed, but there was an error saving it on the backend.");
    }
  } catch (err) {
    console.error(err);
    alert("Error while signing order: " + (err?.message || err));
  }
}

// --------------------- Step 3 – Taker accepts order ---------------------

async function acceptTradeAsTaker() {
  try {
    if (!window.ethereum) {
      alert("MetaMask not found. Please install MetaMask first.");
      return;
    }

    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer   = provider.getSigner();
    const taker    = await signer.getAddress();

    const orderJsonEl = document.getElementById("orderJson");
    const orderSigEl  = document.getElementById("orderSignature");

    if (!orderJsonEl || !orderJsonEl.value) {
      alert("No order JSON found. Load a trade link or paste an order first.");
      return;
    }
    if (!orderSigEl || !orderSigEl.value) {
      alert("No order signature found.");
      return;
    }

    const order     = JSON.parse(orderJsonEl.value);
    const signature = orderSigEl.value.trim();

    console.log("Loaded order for taker:", order, "signature:", signature);

    const zeroAddr = ZERO_ADDRESS.toLowerCase();
    const allowedTaker =
      order.takerAddress.toLowerCase() === zeroAddr ||
      order.takerAddress.toLowerCase() === taker.toLowerCase();

    if (!allowedTaker) {
      alert("This order is not intended for your address.");
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    if (Number(order.expirationTimeSeconds) <= now) {
      alert("This order has expired.");
      return;
    }

    const exchange = new ethers.Contract(
      ZEROX_EXCHANGE_ADDRESS,
      ZEROX_EXCHANGE_ABI,
      signer
    );

    const takerFillAmount = order.takerAssetAmount.toString();

    console.log("Calling fillOrder with:", {
      order,
      takerFillAmount,
      signature,
    });

    const tx = await exchange.fillOrder(order, takerFillAmount, signature);
    console.log("fillOrder tx sent:", tx.hash);
    alert("Trade transaction sent! Tx hash: " + tx.hash);

    const receipt = await tx.wait();
    console.log("Trade confirmed:", receipt);
    alert("NFT swap completed (if all approvals & balances were correct).");
  } catch (err) {
    console.error(err);
    alert("Error while accepting trade: " + (err?.message || err));
  }
}

// --------------------- Auto-load order from Netlify (taker) ---------------------

async function autoLoadOrderFromUrl() {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get("orderId");
  if (!orderId) return;

  try {
    const res = await fetch(
      "/.netlify/functions/get-order?id=" + encodeURIComponent(orderId)
    );
    if (!res.ok) {
      console.warn("Failed to load order:", await res.text());
      return;
    }
    const { order, signature } = await res.json();
    console.log("Loaded order from backend:", order, signature);

    const orderJsonEl = document.getElementById("orderJson");
    const orderSigEl  = document.getElementById("orderSignature");
    if (orderJsonEl) orderJsonEl.value = JSON.stringify(order, null, 2);
    if (orderSigEl)  orderSigEl.value  = signature;
  } catch (e) {
    console.error("Error loading order:", e);
  }
}

// --------------------- Wire up buttons ---------------------

document.addEventListener("DOMContentLoaded", () => {
  const approveBtn = document.getElementById("transferNftButton");
  if (approveBtn) {
    approveBtn.addEventListener("click", approveOperatorForCollection);
  }

  const signBtn = document.getElementById("signOrderButton");
  if (signBtn) {
    signBtn.addEventListener("click", signOrderAsMaker);
  }

  const acceptBtn = document.getElementById("acceptTradeButton");
  if (acceptBtn) {
    acceptBtn.addEventListener("click", acceptTradeAsTaker);
  }

  // Try to auto-load order if ?orderId=... is present
  autoLoadOrderFromUrl();
});
