// server/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createMatrixSearcher } from "./lib/searchMatrix.js";
import { ragAnswer } from "./lib/ragAnswer.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Build the searcher once (loads your knowledge.json into memory)
const searchMatrix = createMatrixSearcher({
  knowledgePath: "./knowledge/knowledge.json",
});

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/**
 * POST /api/ask
 * body: { mode: "Matrix-2026", question: "..." }
 */
app.post("/api/ask", async (req, res) => {
  try {
    const { mode, question } = req.body || {};

    if (!mode) {
      return res.status(400).json({
        answer: "Please select a knowledge base first.",
        source: "System",
      });
    }

    if (!question || String(question).trim().length < 3) {
      return res.status(400).json({
        answer: "Please enter a question.",
        source: "System",
      });
    }

    // For now, only Matrix-2026 is wired to knowledge.json (your ingest already built it)
    if (mode !== "Matrix-2026") {
      return res.json({
        answer:
          "This mode is not wired yet. Please select Matrix-2026 for now.",
        source: `Mode: ${mode}`,
      });
    }

    // Retrieve top matches from knowledge.json
    const results = searchMatrix(String(question), { topK: 5 });

    // If nothing looks relevant, don’t call AI (prevents garbage answers)
    if (!results?.hits?.length || results.hits[0].score < 0.12) {
      return res.json({
        answer:
          "I'm sorry, that information is not covered in our official documentation.",
        source: "Matrix-2026",
        debug: {
          topScore: results?.hits?.[0]?.score ?? 0,
        },
      });
    }

    // Let AI rewrite a clean answer using ONLY retrieved snippets
    const ai = await ragAnswer({
      question: String(question),
      mode: "Matrix-2026",
      hits: results.hits,
    });

    return res.json({
      answer: ai.answer,
      source: ai.source || "Matrix-2026",
      citations: ai.citations || [],
      debug: {
        topScore: results.hits[0].score,
        matchedCount: results.hits.length,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      answer: "Server error while answering from the knowledge base.",
      source: "System",
    });
  }
});

const PORT = process.env.PORT || 5050;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
