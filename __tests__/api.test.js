const express = require("express");
const path = require("path");

// Mock fetch globally before requiring server modules
global.fetch = jest.fn();

// We test the API endpoints by building a minimal express app
// that mirrors server.js routing, using the extracted modules.
const { search } = require("../lib/search");

describe("API Endpoints", () => {
  let app;
  let knowledgeBases;
  const MODES = {
    zhkh: {
      id: "zhkh", name: "ЖКХ и Право", icon: "⚖️",
      description: "Test", type: "rag", kbFile: "kb_zhkh.json",
      systemPrompt: "test prompt",
      examples: ["example 1"], subModes: [{ id: "all", label: "Все" }]
    },
    economics: {
      id: "economics", name: "Экономика", icon: "📊",
      description: "Test eco", type: "rag", kbFile: "kb_economics.json",
      systemPrompt: "eco prompt",
      examples: ["example eco"], subModes: []
    }
  };

  beforeEach(() => {
    app = express();
    app.use(express.json());

    knowledgeBases = {
      zhkh: [
        { q: "Что такое банк?", a: "Банк — кредитная организация", r: "ГК РФ", t: "l" },
        { q: "Капитальный ремонт", a: "Капремонт делается по решению собрания", r: "ЖК РФ", t: "b" },
      ],
      economics: [
        { q: "Что такое ВВП?", a: "ВВП — валовой внутренний продукт", r: "Учебник" },
      ]
    };

    // GET /api/modes
    app.get("/api/modes", (req, res) => {
      const modes = Object.values(MODES).map(m => ({
        id: m.id, name: m.name, icon: m.icon,
        description: m.description, type: m.type,
        examples: m.examples, subModes: m.subModes,
        kbSize: (knowledgeBases[m.id] || []).length
      }));
      res.json({ modes, hasApiKey: !!process.env.ANTHROPIC_API_KEY });
    });

    // POST /api/chat
    app.post("/api/chat", async (req, res) => {
      const { message, modeId, subMode, history } = req.body;
      if (!message) return res.status(400).json({ error: "Пустое сообщение" });

      const mode = MODES[modeId] || MODES.zhkh;
      let context = [];

      if (mode.type === "rag") {
        context = search(knowledgeBases, modeId, message, subMode || "all");
      }

      // In tests, we simulate offline mode (no API key)
      let offlineAnswer;
      if (mode.type === "rag" && context.length > 0) {
        offlineAnswer = "📋 **Результаты из базы знаний:**\n\n" +
          context.map(c => `**${c.q}**\n${c.a}\n📌 _${c.r}_`).join("\n\n");
      } else if (mode.type === "rag") {
        offlineAnswer = "В базе знаний не найдено релевантной информации.";
      } else {
        offlineAnswer = `⚠️ Режим «${mode.name}» работает только с Claude API.`;
      }
      res.json({ answer: offlineAnswer, sources: context, offline: true });
    });

    // POST /api/search
    app.post("/api/search", (req, res) => {
      const { query, modeId, subMode } = req.body;
      res.json({ results: search(knowledgeBases, modeId || "zhkh", query || "", subMode || "all") });
    });

    // GET /health
    app.get("/health", (req, res) => {
      const kbStats = {};
      for (const [k, v] of Object.entries(knowledgeBases)) kbStats[k] = v.length;
      res.json({ status: "ok", modes: Object.keys(MODES).length, kb: kbStats });
    });
  });

  // Helper to make requests using supertest-like approach
  const request = (method, url, body) => {
    return new Promise((resolve) => {
      const req = {
        method, url, body,
        headers: { "content-type": "application/json" }
      };
      const res = {
        statusCode: 200,
        _json: null,
        status(code) { this.statusCode = code; return this; },
        json(data) { this._json = data; resolve({ status: this.statusCode, body: data }); }
      };

      // Find matching route
      const layers = app._router.stack.filter(l => l.route);
      for (const layer of layers) {
        const route = layer.route;
        if (route.path === url && route.methods[method.toLowerCase()]) {
          route.stack[0].handle(
            { ...req, body: body || {} },
            res,
            () => {}
          );
          return;
        }
      }
      resolve({ status: 404, body: null });
    });
  };

  describe("GET /api/modes", () => {
    test("returns list of modes", async () => {
      const { status, body } = await request("GET", "/api/modes");
      expect(status).toBe(200);
      expect(body.modes).toHaveLength(2);
      expect(body.modes[0].id).toBe("zhkh");
    });

    test("includes kbSize for each mode", async () => {
      const { body } = await request("GET", "/api/modes");
      expect(body.modes[0].kbSize).toBe(2);
      expect(body.modes[1].kbSize).toBe(1);
    });

    test("includes hasApiKey flag", async () => {
      const { body } = await request("GET", "/api/modes");
      expect(body).toHaveProperty("hasApiKey");
    });
  });

  describe("POST /api/chat", () => {
    test("returns 400 for empty message", async () => {
      const { status, body } = await request("POST", "/api/chat", { message: "" });
      expect(status).toBe(400);
      expect(body.error).toBe("Пустое сообщение");
    });

    test("returns offline answer with sources when KB matches", async () => {
      const { body } = await request("POST", "/api/chat", {
        message: "банк кредитная организация", modeId: "zhkh"
      });
      expect(body.offline).toBe(true);
      expect(body.sources.length).toBeGreaterThan(0);
      expect(body.answer).toContain("базы знаний");
    });

    test("defaults to zhkh mode config when modeId is invalid", async () => {
      const { body } = await request("POST", "/api/chat", {
        message: "банк", modeId: "invalid_mode"
      });
      expect(body.offline).toBe(true);
      // BUG: search uses the raw modeId, not the defaulted mode — so no results
      // This documents existing behavior. See server.js /api/chat handler.
      expect(body.sources).toEqual([]);
    });

    test("returns no-match message when KB has no results", async () => {
      const { body } = await request("POST", "/api/chat", {
        message: "xyznonexistent", modeId: "zhkh"
      });
      expect(body.answer).toContain("не найдено");
    });
  });

  describe("POST /api/search", () => {
    test("returns search results", async () => {
      const { body } = await request("POST", "/api/search", {
        query: "банк", modeId: "zhkh"
      });
      expect(body.results.length).toBeGreaterThan(0);
    });

    test("defaults to zhkh mode", async () => {
      const { body } = await request("POST", "/api/search", { query: "банк" });
      expect(body.results.length).toBeGreaterThan(0);
    });

    test("handles empty query", async () => {
      const { body } = await request("POST", "/api/search", {});
      expect(body.results).toEqual([]);
    });
  });

  describe("GET /health", () => {
    test("returns ok status", async () => {
      const { body } = await request("GET", "/health");
      expect(body.status).toBe("ok");
    });

    test("returns mode count", async () => {
      const { body } = await request("GET", "/health");
      expect(body.modes).toBe(2);
    });

    test("returns KB stats", async () => {
      const { body } = await request("GET", "/health");
      expect(body.kb.zhkh).toBe(2);
      expect(body.kb.economics).toBe(1);
    });
  });
});
