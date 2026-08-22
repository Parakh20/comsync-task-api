'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/tasks', async (req, res, next) => {
  try {
    const result = await db.query('SELECT id, title, done, created_at FROM tasks ORDER BY id DESC LIMIT 100');
    res.json(result.rows);
  } catch (err) {
    next(err);
  }
});

router.post('/tasks', async (req, res, next) => {
  try {
    const { title } = req.body || {};
    if (typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'title is required' });
    }
    const result = await db.query(
      'INSERT INTO tasks (title) VALUES ($1) RETURNING id, title, done, created_at',
      [title.trim()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/tasks/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const { done } = req.body || {};
    if (typeof done !== 'boolean') return res.status(400).json({ error: 'done must be boolean' });
    const result = await db.query(
      'UPDATE tasks SET done = $1 WHERE id = $2 RETURNING id, title, done, created_at',
      [done, id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/tasks/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
    const result = await db.query('DELETE FROM tasks WHERE id = $1', [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
