// scripts/transfer_ownership.js
async function main() {
    const newOwner = '0xeCa31BBbB7778aAF6743AF9Ad37e3bf17DA179c6';

    console.log("Transferring ownership of ProxyAdmin...");
    // The owner of the ProxyAdmin can upgrade our contracts
    await upgrades.admin.transferProxyAdminOwnership(newOwner);
    console.log("Transferred ownership of ProxyAdmin to:", newOwner);
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });