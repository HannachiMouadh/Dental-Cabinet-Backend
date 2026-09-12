const express = require("express");
const router = express.Router();
const Expense = require("../models/expense.model");
const Patient = require("../models/patient.model");
const User = require("../models/user.model");
const { verifyToken } = require("../middleware/auth.middleware");

// Helper: parse numbers safely
const parseAmount = (val) => {
  if (!val) return 0;
  const num = parseFloat(String(val).replace(/[^0-9.-]/g, ""));
  return isNaN(num) ? 0 : num;
};

// 1. GET ALL EXPENSES (Doctor only)
router.get("/expenses", verifyToken(["doctor"]), async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1, createdAt: -1 });
    res.json(expenses);
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la récupération des dépenses", error: error.message });
  }
});

// 2. ADD AN EXPENSE (Doctor only)
router.post("/expenses", verifyToken(["doctor"]), async (req, res) => {
  try {
    const { title, spending, cost, category, date, notes } = req.body;

    const expenseTitle = title || spending;
    if (!expenseTitle) {
      return res.status(400).json({ message: "Le titre ou type de dépense est requis." });
    }

    const newExpense = new Expense({
      title: expenseTitle,
      cost: Number(cost) || 0,
      category: category || "Autre",
      date: date ? new Date(date) : new Date(),
      notes: notes || "",
      createdBy: req.user?.id
    });

    await newExpense.save();

    res.status(201).json(newExpense);

  } catch (error) {
    res.status(500).json({ message: "Erreur lors de l'enregistrement de la dépense", error: error.message });
  }
});

// 3. DELETE AN EXPENSE (Doctor only)
router.delete("/expenses/:id", verifyToken(["doctor"]), async (req, res) => {
  try {
    const deleted = await Expense.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Dépense introuvable" });
    }
    res.json({ message: "Dépense supprimée avec succès", id: req.params.id });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors de la suppression de la dépense", error: error.message });
  }
});

// 4. GET FINANCIAL ANALYTICS (Doctor only)
router.get("/analytics", verifyToken(["doctor"]), async (req, res) => {
  try {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11

    const startOfMonth = new Date(currentYear, currentMonth, 1);
    const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);

    // Fetch all patients with treatment sessions
    const patients = await Patient.find({}, "name lastName treatmentSessions createdAt");
    const expenses = await Expense.find().sort({ date: -1 });

    // Financial accumulator
    let monthDoit = 0;
    let monthRecu = 0;
    let yearDoit = 0;
    let yearRecu = 0;
    let allTimeDoit = 0;
    let allTimeRecu = 0;

    // Monthly breakdown for the current year (12 months)
    const monthlySeries = Array.from({ length: 12 }, (_, i) => ({
      monthIndex: i,
      monthName: new Date(currentYear, i, 1).toLocaleString("fr-FR", { month: "short" }),
      recu: 0,
      doit: 0,
      depenses: 0,
      net: 0
    }));

    // Iterate through patient treatment sessions
    patients.forEach((p) => {
      if (Array.isArray(p.treatmentSessions)) {
        p.treatmentSessions.forEach((session) => {
          const d = session.date ? new Date(session.date) : new Date(p.createdAt);
          const sessionDoit = parseAmount(session.doit);
          const sessionRecu = parseAmount(session.recu);

          allTimeDoit += sessionDoit;
          allTimeRecu += sessionRecu;

          if (d >= startOfYear && d <= endOfYear) {
            yearDoit += sessionDoit;
            yearRecu += sessionRecu;

            const mIdx = d.getMonth();
            if (mIdx >= 0 && mIdx < 12) {
              monthlySeries[mIdx].doit += sessionDoit;
              monthlySeries[mIdx].recu += sessionRecu;
            }
          }

          if (d >= startOfMonth && d <= endOfMonth) {
            monthDoit += sessionDoit;
            monthRecu += sessionRecu;
          }
        });
      }
    });

    // Expenses breakdown
    let monthExpense = 0;
    let yearExpense = 0;
    let allTimeExpense = 0;

    expenses.forEach((exp) => {
      const expDate = exp.date ? new Date(exp.date) : new Date(exp.createdAt);
      const expCost = Number(exp.cost) || 0;

      allTimeExpense += expCost;

      if (expDate >= startOfYear && expDate <= endOfYear) {
        yearExpense += expCost;
        const mIdx = expDate.getMonth();
        if (mIdx >= 0 && mIdx < 12) {
          monthlySeries[mIdx].depenses += expCost;
        }
      }

      if (expDate >= startOfMonth && expDate <= endOfMonth) {
        monthExpense += expCost;
      }
    });

    // Compute Net Earnings per month
    monthlySeries.forEach((m) => {
      m.net = m.recu - m.depenses;
    });

    // Calculate Nets
    const monthNet = monthRecu - monthExpense;
    const yearNet = yearRecu - yearExpense;
    const allTimeNet = allTimeRecu - allTimeExpense;

    res.json({
      summary: {
        currentMonth: {
          name: now.toLocaleString("fr-FR", { month: "long", year: "numeric" }),
          totalDoit: monthDoit,
          totalRecu: monthRecu,
          totalExpenses: monthExpense,
          netEarnings: monthNet,
          unpaidRemainder: Math.max(0, monthDoit - monthRecu)
        },
        currentYear: {
          year: currentYear,
          totalDoit: yearDoit,
          totalRecu: yearRecu,
          totalExpenses: yearExpense,
          netEarnings: yearNet,
          unpaidRemainder: Math.max(0, yearDoit - yearRecu)
        },
        allTime: {
          totalDoit: allTimeDoit,
          totalRecu: allTimeRecu,
          totalExpenses: allTimeExpense,
          netEarnings: allTimeNet,
          unpaidRemainder: Math.max(0, allTimeDoit - allTimeRecu)
        }
      },
      monthlyBreakdown: monthlySeries,
      recentExpenses: expenses.slice(0, 10),
      totalExpensesCount: expenses.length
    });
  } catch (error) {
    res.status(500).json({ message: "Erreur lors du calcul des analytics", error: error.message });
  }
});

module.exports = router;
