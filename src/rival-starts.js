// New campaigns start with one seeded-random post, no fleet or routes.
// Stable IDs, capital tiers and starting licenses also identify existing saved rivals.
export const RIVAL_STARTS = [
  {
    "id": "company-1",
    "name": "オランダ西インド会社",
    "nameEn": "Dutch West India Company",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "netherlands"
    ],
    "routes": [],
    "posts": [
      "willemstad"
    ],
    "preferredRegions": [
      "caribbean"
    ]
  },
  {
    "id": "company-2",
    "name": "スペイン商館",
    "nameEn": "Spanish Trading House",
    "kind": "large",
    "capital": 60000,
    "licenses": [
      "spain"
    ],
    "routes": [],
    "posts": [
      "cadiz"
    ],
    "preferredRegions": [
      "caribbean",
      "centralAmerica",
      "southAmerica"
    ]
  },
  {
    "id": "company-3",
    "name": "イギリス東インド会社",
    "nameEn": "English East India Company",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "england"
    ],
    "routes": [],
    "posts": [
      "bombay",
      "madras"
    ],
    "preferredRegions": [
      "southAsia"
    ]
  },
  {
    "id": "company-4",
    "name": "オランダ東インド会社",
    "nameEn": "Dutch East India Company",
    "kind": "large",
    "capital": 60000,
    "licenses": [
      "netherlands"
    ],
    "routes": [],
    "posts": [
      "batavia"
    ],
    "preferredRegions": [
      "southeastAsia"
    ]
  },
  {
    "id": "company-5",
    "name": "オスマン商人",
    "nameEn": "Ottoman Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "ottoman"
    ],
    "routes": [],
    "posts": [
      "istanbul",
      "alexandria"
    ],
    "preferredRegions": [
      "mediterranean",
      "westAsia",
      "africa"
    ]
  },
  {
    "id": "company-6",
    "name": "インド商人",
    "nameEn": "Indian Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "mughal"
    ],
    "routes": [],
    "posts": [
      "surat"
    ],
    "preferredRegions": [
      "southAsia"
    ]
  },
  {
    "id": "company-7",
    "name": "清国商人",
    "nameEn": "Qing Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "qing"
    ],
    "routes": [],
    "posts": [
      "tianjin",
      "shanghai",
      "ningbo",
      "fuzhou",
      "xiamen",
      "guangzhou"
    ],
    "preferredRegions": [
      "eastAsia"
    ]
  },
  {
    "id": "company-8",
    "name": "日本商人",
    "nameEn": "Japanese Merchants",
    "kind": "small",
    "capital": 5000,
    "licenses": [
      "japan"
    ],
    "routes": [],
    "posts": [
      "osaka",
      "edo",
      "nagasaki"
    ],
    "preferredRegions": [
      "eastAsia"
    ]
  },
  {
    "id": "company-9",
    "name": "ジェノバ商人",
    "nameEn": "Genoese Merchants",
    "kind": "small",
    "capital": 5000,
    "licenses": [
      "genoa",
      "tuscany"
    ],
    "routes": [],
    "posts": [
      "genoa"
    ],
    "preferredRegions": [
      "mediterranean"
    ]
  },
  {
    "id": "company-10",
    "name": "ベネチア商人",
    "nameEn": "Venetian Merchants",
    "kind": "small",
    "capital": 5000,
    "licenses": [
      "venice",
      "ottoman"
    ],
    "routes": [],
    "posts": [
      "venice"
    ],
    "preferredRegions": [
      "mediterranean"
    ]
  },
  {
    "id": "company-11",
    "name": "南海会社",
    "nameEn": "South Sea Company",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "england"
    ],
    "routes": [],
    "posts": [
      "kingston",
      "bridgetown"
    ],
    "preferredRegions": [
      "caribbean"
    ]
  },
  {
    "id": "company-12",
    "name": "ポルトガル商館",
    "nameEn": "Portuguese Trading House",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "portugal"
    ],
    "routes": [],
    "posts": [
      "lisbon"
    ],
    "preferredRegions": [
      "southAmerica"
    ]
  },
  {
    "id": "company-13",
    "name": "オマーン商人",
    "nameEn": "Omani Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "oman"
    ],
    "routes": [],
    "posts": [
      "muscat"
    ],
    "preferredRegions": [
      "africa"
    ]
  },
  {
    "id": "company-14",
    "name": "フランス東インド会社",
    "nameEn": "French East India Company",
    "kind": "small",
    "capital": 5000,
    "licenses": [
      "france",
      "mughal"
    ],
    "routes": [],
    "posts": [
      "pondicherry"
    ],
    "preferredRegions": [
      "southAsia"
    ]
  }
];

// These templates enter later; capital is supplied by the entry ranking rules.
export const RIVAL_RESERVES = [
  {
    "id": "company-15",
    "name": "フランス商業組合",
    "nameEn": "French Merchants Guild",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "france"
    ],
    "routes": [],
    "posts": [
      "bordeaux",
      "nantes",
      "rouen"
    ],
    "preferredRegions": [
      "westEurope"
    ],
    "reserve": true
  },
  {
    "id": "company-16",
    "name": "イギリス商業組合",
    "nameEn": "English Merchants Guild",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "england"
    ],
    "routes": [],
    "posts": [
      "london"
    ],
    "preferredRegions": [
      "northEurope"
    ],
    "reserve": true
  },
  {
    "id": "company-17",
    "name": "オランダ商業組合",
    "nameEn": "Dutch Merchants Guild",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "netherlands"
    ],
    "routes": [],
    "posts": [
      "amsterdam"
    ],
    "preferredRegions": [
      "westEurope"
    ],
    "reserve": true
  },
  {
    "id": "company-18",
    "name": "ドイツ商業組合",
    "nameEn": "German Merchants Guild",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "hamburg"
    ],
    "routes": [],
    "posts": [
      "hamburg"
    ],
    "preferredRegions": [
      "centralEurope"
    ],
    "reserve": true
  },
  {
    "id": "company-19",
    "name": "ラグーザ商人",
    "nameEn": "Ragusan Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "ragusa"
    ],
    "routes": [],
    "posts": [
      "ragusa"
    ],
    "preferredRegions": [
      "mediterranean",
      "balkans"
    ],
    "reserve": true
  },
  {
    "id": "company-20",
    "name": "満州商人",
    "nameEn": "Manchurian Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "qing"
    ],
    "routes": [],
    "posts": [
      "tianjin"
    ],
    "preferredRegions": [
      "eastAsia"
    ],
    "reserve": true
  },
  {
    "id": "company-21",
    "name": "朝鮮商人",
    "nameEn": "Korean Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "joseon"
    ],
    "routes": [],
    "posts": [
      "busan"
    ],
    "preferredRegions": [
      "eastAsia"
    ],
    "reserve": true
  },
  {
    "id": "company-22",
    "name": "スカンジナビア商業組合",
    "nameEn": "Scandinavian Merchants Guild",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "sweden",
      "denmark"
    ],
    "routes": [],
    "posts": [
      "stockholm",
      "riga",
      "copenhagen"
    ],
    "preferredRegions": [
      "scandinavia"
    ],
    "reserve": true
  },
  {
    "id": "company-23",
    "name": "ナポリ商人",
    "nameEn": "Neapolitan Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "spain"
    ],
    "routes": [],
    "posts": [
      "naples"
    ],
    "preferredRegions": [
      "mediterranean"
    ],
    "reserve": true
  },
  {
    "id": "company-24",
    "name": "北アフリカ商業組合",
    "nameEn": "North African Merchants Guild",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "ottoman"
    ],
    "routes": [],
    "posts": [
      "tunis",
      "tripoli"
    ],
    "preferredRegions": [
      "mediterranean"
    ],
    "reserve": true
  },
  {
    "id": "company-25",
    "name": "ロシア商人",
    "nameEn": "Russian Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "russia"
    ],
    "routes": [],
    "posts": [
      "moscow",
      "kyiv"
    ],
    "preferredRegions": [
      "centralEurope",
      "siberia"
    ],
    "reserve": true
  },
  {
    "id": "company-26",
    "name": "ペルシア商人",
    "nameEn": "Persian Merchants",
    "kind": "medium",
    "capital": 25000,
    "licenses": [
      "safavid"
    ],
    "routes": [],
    "posts": [
      "bandarabbas"
    ],
    "preferredRegions": [
      "westAsia"
    ],
    "reserve": true
  }
];
export const RIVAL_CANDIDATES = [...RIVAL_STARTS, ...RIVAL_RESERVES];
