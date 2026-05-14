// BSC Mainnet (chainId: 56) deployed contract addresses
export const CHAIN_ID = 56;

export const CONTRACTS = {
  Committee: '0xe10F967DD356504EDB731612789D0D0f0ba2929f',
  MintableERC20Factory: '0x9979989709cE98715f2cA831C4FDb73b22d0408c',
  CommunityFactory: '0x5597e814399906095ecaA5769A40394F58E5E0Cf',
  ERC20StakingFactory: '0xDc3f940ac6Da516d5C9cc59c8AFE0F85A576E2A4',
  ERC20LockingFactory: '0x8189a03Cfa3d8919a2eb8f08E4f88c21Cf78cA01',
  ERC1155StakingFactory: '0x398eA6Db014595F23d0C9Cb1390a10472cdD43BA',
  SPStakingFactory: '0x47738e3420Be8ceD8a9476cf4dAf84c549835D44',
  SocialCurationFactory: '0xc4674D3fBbD201Ea401a8B7e7285F956178593D8',
  LinearCalculator: '0x5114966657Bd6209B47aa16eaa4EAfbbC9595ec0',
  LinearTimeCalculator: '0xc76e00e150e13EC95514E9a52Ab0314c7faE8207',
};

export const BSC_CONFIG = {
  chainId: `0x${CHAIN_ID.toString(16)}`,
  chainName: 'BNB Smart Chain',
  rpcUrls: ['https://bsc-dataseed.binance.org/', 'https://bsc-dataseed1.defibit.io/'],
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
  blockExplorerUrls: ['https://bscscan.com'],
};

// BSC block time ~3s => ~10,512,000 blocks/year
export const BLOCKS_PER_YEAR = 10_512_000;
export const BLOCK_TIME_SECONDS = 3;

// Subgraph endpoint (The Graph Studio)
// NOTE: Replace with your actual API key endpoint when available
export const SUBGRAPH_URL = 'https://api.studio.thegraph.com/query/90467/tagai-bsc/version/latest';
