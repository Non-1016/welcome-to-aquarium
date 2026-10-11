// セッションごとに、このファイルだけ編集します。
// 人数は1〜4人。不要なPCのブロックは削除してください。

window.AQUARIUM_SESSION = {
  // 別のセッションでは、このIDも変更してください。
  sessionId: "session-001",

    // 職員証に記載する認証情報
  staffAuth: {
    staffId: "AQUA-01", // 職員ID
    code: "0417"       // 認証コード
  },

  specimens: [
    {
        specimenId: "SP-001",
        name: "個体001",
        species: "人間"
    },
    {
        specimenId: "SP-002",
        name: "個体002",
        species: "深きものの混血種"
    }
  ],

  visitors: [
    // PC1
    {
      entryId: "IN-001",   // 入館番号
      name: "探索者1",     // 対象者の氏名（PC名）
      species: "人間",     //種族
      permitId: "OUT-001"  // 退館許可番号
    },

    // PC2
    {
      entryId: "IN-002",
      name: "探索者2",
      species: "人間",
      permitId: "OUT-002"
    },

    // PC3
    {
      entryId: "IN-003",
      name: "探索者3",
      species: "人間",
      permitId: "OUT-003"
    },

    // PC4
    {
      entryId: "IN-004",
      name: "探索者4",
      species: "人間",
      permitId: "OUT-004"
    }
    
  ]

  
};