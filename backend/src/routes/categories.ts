import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = Router();

// Get all categories
router.get('/', async (req: Request, res: Response) => {
  try {
    const categories = await db('categories').select('*').orderBy('order', 'asc');
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// Get single category
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await db('categories').where('id', id).first();
    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// Create category
router.post('/', async (req: Request, res: Response) => {
  try {
    const { name, color, icon, order } = req.body;
    const id = uuidv4();

    const newCategory = {
      id,
      name,
      color,
      icon,
      order: order || 0,
    };

    await db('categories').insert(newCategory);

    // Log audit
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'CREATE',
      entity_type: 'CATEGORY',
      entity_id: id,
      old_values: {},
      new_values: newCategory,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.status(201).json(newCategory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// Reorder categories: [{ id, order }] (home page tree, folder drag).
router.put('/reorder', async (req: Request, res: Response) => {
  const items: { id: string; order: number }[] = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0) {
    res.status(400).json({ error: 'No items to reorder' });
    return;
  }
  try {
    await db.transaction(async (trx) => {
      for (const item of items) {
        await trx('categories').where('id', item.id).update({ order: item.order, updated_at: new Date() });
      }
    });
    res.json({ ok: true, count: items.length });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reorder categories' });
  }
});

// Update category
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const oldCategory = await db('categories').where('id', id).first();

    if (!oldCategory) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    const { name, color, icon, order } = req.body;

    const updateData = {
      name,
      color,
      icon,
      order,
      updated_at: new Date(),
    };

    Object.keys(updateData).forEach(key => updateData[key as keyof typeof updateData] === undefined && delete updateData[key as keyof typeof updateData]);

    await db('categories').where('id', id).update(updateData);

    // Log audit
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'UPDATE',
      entity_type: 'CATEGORY',
      entity_id: id,
      old_values: oldCategory,
      new_values: updateData,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json(updateData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// Delete category
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await db('categories').where('id', id).first();

    if (!category) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }

    // Log audit before deletion
    await db('audit_logs').insert({
      id: uuidv4(),
      action: 'DELETE',
      entity_type: 'CATEGORY',
      entity_id: id,
      old_values: category,
      new_values: {},
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    await db('categories').where('id', id).delete();

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
