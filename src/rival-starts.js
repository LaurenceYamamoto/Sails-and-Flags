// New-game roster for the WebAssembly engine; capital includes the initial fleet.
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
    "routes": [
      {
        "kind": "brig",
        "fleet": 2,
        "stops": [
          "amsterdam",
          "willemstad"
        ]
      }
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
    "routes": [
      {
        "kind": "fluyt",
        "fleet": 2,
        "stops": [
          "cadiz",
          "havana"
        ]
      },
      {
        "kind": "sloop",
        "fleet": 2,
        "stops": [
          "havana",
          "santiago",
          "sanjuan"
        ]
      }
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
    "routes": [
      {
        "kind": "brig",
        "fleet": 2,
        "stops": [
          "bombay",
          "madras"
        ]
      }
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
    "routes": [
      {
        "kind": "fluyt",
        "fleet": 3,
        "stops": [
          "amsterdam",
          "elmina",
          "capetown",
          "batavia",
          "colombo",
          "capetown",
          "elmina"
        ]
      }
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
    "routes": [
      {
        "kind": "caravan",
        "fleet": 2,
        "stops": [
          "izmir",
          "ankara"
        ]
      },
      {
        "kind": "caravan",
        "fleet": 2,
        "stops": [
          "aleppo",
          "damascus"
        ]
      }
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
    "routes": [
      {
        "kind": "caravan",
        "fleet": 2,
        "stops": [
          "surat",
          "ahmedabad"
        ]
      },
      {
        "kind": "caravan",
        "fleet": 2,
        "stops": [
          "agra",
          "delhi"
        ]
      }
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
    "routes": [
      {
        "kind": "caravan",
        "fleet": 2,
        "stops": [
          "beijing",
          "nanjing"
        ]
      },
      {
        "kind": "wagon",
        "fleet": 2,
        "stops": [
          "nanjing",
          "suzhou"
        ]
      }
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
    "routes": [
      {
        "kind": "sloop",
        "fleet": 1,
        "stops": [
          "osaka",
          "nagasaki"
        ]
      },
      {
        "kind": "sloop",
        "fleet": 1,
        "stops": [
          "osaka",
          "edo"
        ]
      }
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
    "routes": [
      {
        "kind": "sloop",
        "fleet": 1,
        "stops": [
          "genoa",
          "livorno"
        ]
      }
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
    "routes": [
      {
        "kind": "sloop",
        "fleet": 1,
        "stops": [
          "venice",
          "istanbul"
        ]
      }
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
    "routes": [
      {
        "kind": "brig",
        "fleet": 2,
        "stops": [
          "london",
          "kingston"
        ]
      }
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
    "routes": [
      {
        "kind": "brig",
        "fleet": 1,
        "stops": [
          "lisbon",
          "luanda"
        ]
      },
      {
        "kind": "brig",
        "fleet": 1,
        "stops": [
          "luanda",
          "mozambique"
        ]
      }
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
    "routes": [
      {
        "kind": "brig",
        "fleet": 1,
        "stops": [
          "muscat",
          "mombasa"
        ]
      },
      {
        "kind": "sloop",
        "fleet": 1,
        "stops": [
          "mombasa",
          "zanzibar"
        ]
      }
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
    "routes": [
      {
        "kind": "sloop",
        "fleet": 1,
        "stops": [
          "pondicherry",
          "hughli"
        ]
      }
    ]
  }
];
