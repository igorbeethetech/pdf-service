// server.js - Microserviço para processar PDFs
const express = require('express');
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Log das requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Rota raiz
app.get('/', (req, res) => {
  res.json({ 
    message: 'PDF Service API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: 'GET /health',
      fillPdf: 'POST /fill-pdf',
      discoverFields: 'POST /discover-fields'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: process.env.PORT || 'not set',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Endpoint para preencher PDF
app.post('/fill-pdf', async (req, res) => {
  try {
    console.log('Received fill-pdf request');
    const { pdf_base64, fields } = req.body;
    
    if (!pdf_base64) {
      return res.status(400).json({
        success: false,
        error: 'pdf_base64 is required'
      });
    }

    if (!fields || typeof fields !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'fields object is required'
      });
    }
    
    // Debug do base64 recebido
    console.log('Base64 length:', pdf_base64.length);
    console.log('Base64 first 100 chars:', pdf_base64.substring(0, 100));
    
    // Validar se é base64 válido
    if (!/^[A-Za-z0-9+/]+=*$/.test(pdf_base64)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid base64 format'
      });
    }
    
    // Carregar PDF com validação
    console.log('Converting base64 to buffer...');
    const pdfBytes = Buffer.from(pdf_base64, 'base64');
    
    // Verificar se começa com %PDF
    const pdfHeader = pdfBytes.slice(0, 10).toString();
    console.log('PDF header:', pdfHeader);
    
    if (!pdfHeader.startsWith('%PDF')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PDF format - missing PDF header',
        received_header: pdfHeader
      });
    }
    
    console.log('Loading PDF document...');
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    
    console.log('PDF loaded successfully, processing fields...');
    
    // Contador de campos preenchidos
    let fieldsProcessed = 0;
    
    // Preencher campos
    Object.keys(fields).forEach(fieldName => {
      const value = fields[fieldName];
      
      if (value !== undefined && value !== null && value !== '') {
        try {
          const field = form.getField(fieldName);
          
          if (field.constructor.name === 'PDFTextField') {
            field.setText(String(value));
            fieldsProcessed++;
            console.log(`Text field '${fieldName}' filled with: ${value}`);
          } else if (field.constructor.name === 'PDFCheckBox') {
            if (value === true || value === 'true' || value === 'Yes') {
              field.check();
              fieldsProcessed++;
              console.log(`Checkbox '${fieldName}' checked`);
            } else {
              field.uncheck();
              console.log(`Checkbox '${fieldName}' unchecked`);
            }
          } else if (field.constructor.name === 'PDFDropdown') {
            field.select(String(value));
            fieldsProcessed++;
            console.log(`Dropdown '${fieldName}' selected: ${value}`);
          } else if (field.constructor.name === 'PDFRadioGroup') {
            field.select(String(value));
            fieldsProcessed++;
            console.log(`Radio '${fieldName}' selected: ${value}`);
          }
          
        } catch (error) {
          console.log(`Field '${fieldName}' not found or error: ${error.message}`);
        }
      }
    });
    
    // Finalizar
    console.log('Flattening form...');
    form.flatten();
    
    console.log('Generating final PDF...');
    const finalPdfBytes = await pdfDoc.save();
    
    console.log(`PDF processing completed. Fields processed: ${fieldsProcessed}`);
    
    // Retornar PDF em base64
    res.json({
      success: true,
      pdf_base64: Buffer.from(finalPdfBytes).toString('base64'),
      fields_processed: fieldsProcessed,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in fill-pdf:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para descobrir campos
app.post('/discover-fields', async (req, res) => {
  try {
    console.log('Received discover-fields request');
    const { pdf_base64 } = req.body;
    
    if (!pdf_base64) {
      return res.status(400).json({
        success: false,
        error: 'pdf_base64 is required'
      });
    }
    
    // Debug e validação
    console.log('Base64 length:', pdf_base64.length);
    console.log('Base64 first 100 chars:', pdf_base64.substring(0, 100));
    
    if (!/^[A-Za-z0-9+/]+=*$/.test(pdf_base64)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid base64 format'
      });
    }
    
    const pdfBytes = Buffer.from(pdf_base64, 'base64');
    
    // Verificar header PDF
    const pdfHeader = pdfBytes.slice(0, 10).toString();
    console.log('PDF header:', pdfHeader);
    
    if (!pdfHeader.startsWith('%PDF')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PDF format - missing PDF header',
        received_header: pdfHeader
      });
    }
    
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    
    const fieldsInfo = fields.map(field => ({
      name: field.getName(),
      type: field.constructor.name,
      ...(field.constructor.name === 'PDFTextField' && {
        current_text: field.getText() || '',
        max_length: field.getMaxLength()
      }),
      ...(field.constructor.name === 'PDFCheckBox' && {
        is_checked: field.isChecked()
      }),
      ...(field.constructor.name === 'PDFDropdown' && {
        options: field.getOptions(),
        current_selection: field.getSelected()
      })
    }));
    
    console.log(`Found ${fields.length} fields in PDF`);
    
    res.json({ 
      success: true,
      fields: fieldsInfo,
      total_fields: fields.length,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error in discover-fields:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false, 
    error: 'Internal server error' 
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    available_endpoints: ['/', '/health', '/fill-pdf', '/discover-fields'],
    method: req.method,
    path: req.originalUrl
  });
});

// Configuração de porta
const PORT = process.env.PORT || 80;

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`PDF Service running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Time: ${new Date().toISOString()}`);
  console.log('Available endpoints:');
  console.log('  GET  / - API info');
  console.log('  GET  /health - Health check');
  console.log('  POST /fill-pdf - Fill PDF form');
  console.log('  POST /discover-fields - Discover PDF fields');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
    process.exit(1);
  } else {
    console.error('Server error:', err);
    process.exit(1);
  }
});
