const { fromRpcSig } = require('ethereumjs-util')

async function ethSignTypedData(from, data) {
  const result = await new Promise((res, rej) =>
    web3.currentProvider.send(
      { jsonrpc: '2.0', method: 'eth_signTypedData', params: [from, data], id: 1 },
      (err, sig) => (err ? rej(err) : res(sig))
    )
  )
  const sig = fromRpcSig(result.result)
  return [sig.v, sig.r, sig.s]
}

const EIP712Domain = [
  { name: 'name', type: 'string' },
  { name: 'version', type: 'string' },
  { name: 'chainId', type: 'uint256' },
  { name: 'verifyingContract', type: 'address' }
]

function makeLegacyMsg(domain, from, to, nonce, expiry, allowed) {
  return {
    types: {
      EIP712Domain,
      Permit: [
        { name: 'holder', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'expiry', type: 'uint256' },
        { name: 'allowed', type: 'bool' }
      ]
    },
    primaryType: 'Permit',
    domain,
    message: {
      holder: from,
      spender: to,
      nonce,
      expiry,
      allowed
    }
  }
}

module.exports = {
  ethSignTypedData,
  makeLegacyMsg,
}
