// server.js - Microserviço para processar PDFs
const express = require('express');
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());

app.use(express.json({ limit: '50mb' }));

app.post('/fill-pdf', async (req, res) => {
  try {
    const { pdf_base64, fields } = req.body;
    
    // Carregar PDF
    const pdfBytes = Buffer.from(pdf_base64, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    
    // Preencher campos
    Object.keys(fields).forEach(fieldName => {
      const value = fields[fieldName];
      
      if (value !== undefined && value !== null && value !== '') {
        try {
          const field = form.getField(fieldName);
          
          if (field.constructor.name === 'PDFTextField') {
            field.setText(String(value));
          } else if (field.constructor.name === 'PDFCheckBox') {
            if (value === true || value === 'true' || value === 'Yes') {
              field.check();
            }
          } else if (field.constructor.name === 'PDFDropdown') {
            field.select(String(value));
          }
        } catch (error) {
          console.log(`Campo ${fieldName} não encontrado`);
        }
      }
    });
    
    // Finalizar
    form.flatten();
    const finalPdfBytes = await pdfDoc.save();
    
    // Retornar PDF em base64
    res.json({
      success: true,
      pdf_base64: Buffer.from(finalPdfBytes).toString('base64')
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para descobrir campos
app.post('/discover-fields', async (req, res) => {
  try {
    const { pdf_base64 } = req.body;
    const pdfBytes = Buffer.from(pdf_base64, 'base64');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    const fieldsInfo = fields.map(field => ({
      name: field.getName(),
      type: field.constructor.name
    }));
    
    res.json({ fields: fieldsInfo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 80;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDF Service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Para rodar:
// npm init -y
// npm install express pdf-lib
// node server.js
