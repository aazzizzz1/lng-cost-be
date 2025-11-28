const express = require("express");
const multer = require("multer");
const upload = multer();
const controller = require("../controllers/opex.controller");
const { validateCreate, validateUpdate } = require("../middlewares/opex.middleware");

const router = express.Router();

// CRUD
router.get("/", controller.getAll);
router.get("/:id", controller.getById);
router.post("/", validateCreate, controller.create);
router.put("/:id", validateUpdate, controller.updateById);
router.delete("/:id", controller.deleteById);
// optional bulk delete
router.delete("/", controller.deleteAll);

// Excel upload (field name: file)
router.post("/upload", upload.single("file"), controller.uploadExcel);

module.exports = router;
