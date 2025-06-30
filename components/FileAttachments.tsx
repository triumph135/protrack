'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Upload, File, Trash2, Download, Edit, Save, X, 
  FileText, Image, AlertCircle, Loader2 
} from 'lucide-react'
import { fileUploadService } from '@/lib/fileUploadService'

interface FileAttachmentsProps {
  entityType: string
  entityId: string
  tenantId: string
  userId: string
  canEdit?: boolean
  className?: string
}

interface Attachment {
  id: string
  tenant_id: string
  entity_type: string
  entity_id: string
  file_name: string
  file_size: number
  file_type: string
  storage_path: string
  uploaded_by: string | null
  description: string | null
  created_at: string
  updated_at: string
  uploaded_by_user?: { name: string }
}

export default function FileAttachments({ 
  entityType, 
  entityId, 
  tenantId, 
  userId, 
  canEdit = true,
  className = '' 
}: FileAttachmentsProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [editingDescription, setEditingDescription] = useState<string | null>(null)
  const [newDescription, setNewDescription] = useState('')
  const [uploadDescription, setUploadDescription] = useState('')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadAttachments = useCallback(async () => {
    try {
      setLoading(true)
      setError('')
      const data = await fileUploadService.getAttachments(entityType, entityId)
      setAttachments(data)
    } catch (err) {
      setError('Failed to load attachments: ' + (err as Error).message)
    } finally {
      setLoading(false)
    }
  }, [entityType, entityId])

  // Set context and load attachments
  useEffect(() => {
    if (tenantId && userId && entityId) {
      fileUploadService.setContext(tenantId, userId)
      loadAttachments()
    }
  }, [tenantId, userId, entityId, loadAttachments])

  const handleFileSelect = (files: FileList | null) => {
    if (!canEdit || !files) return
    
    Array.from(files).forEach(file => {
      uploadFile(file)
    })
  }

  const uploadFile = async (file: File, description = '') => {
    try {
      setUploading(true)
      setError('')
      setSuccess('')
      
      // Use the uploadDescription if no description is provided
      const finalDescription = description || uploadDescription
      
      const attachment = await fileUploadService.uploadFile(
        file, 
        entityType, 
        entityId, 
        finalDescription
      )
      
      // Add to local state
      setAttachments(prev => [attachment, ...prev])
      
      // Clear the description input after successful upload
      setUploadDescription('')
      
    } catch (err) {
      setError('Upload failed: ' + (err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (attachmentId: string) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) {
      return
    }

    try {
      setError('')
      setSuccess('')
      await fileUploadService.deleteAttachment(attachmentId)
      setAttachments(prev => prev.filter(att => att.id !== attachmentId))
    } catch (err) {
      setError('Delete failed: ' + (err as Error).message)
    }
  }

  const handleDownload = async (attachment: Attachment) => {
    try {
      setError('')
      setSuccess('')
      const url = await fileUploadService.getFileUrl(attachment.storage_path)
      if (url) {
        // Enhanced download logic for better mobile compatibility
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
        
        if (isMobile) {
          // For mobile devices, especially iOS, use a more reliable approach
          if (isIOS) {
            // iOS Safari often doesn't respect the download attribute
            // Open in new window and let user save manually
            const newWindow = window.open()
            if (newWindow) {
              newWindow.location.href = url
              setSuccess(`Opening ${attachment.file_name} in new tab. Use your browser's save options to download.`)
              // Show user instructions for iOS
              setTimeout(() => {
                if (!newWindow.closed) {
                  alert('To save this file on iOS:\n1. Tap and hold the file\n2. Select "Save to Files" or "Share"\n3. Choose your preferred location')
                }
              }, 1000)
            } else {
              // Fallback to direct link if popup blocked
              window.location.href = url
              setSuccess(`Download initiated for ${attachment.file_name}`)
            }
          } else {
            // For Android and other mobile browsers
            try {
              // Try the standard download approach first
              const link = document.createElement('a')
              link.href = url
              link.download = attachment.file_name
              link.style.display = 'none'
              
              // Add to document, click, then remove
              document.body.appendChild(link)
              link.click()
              document.body.removeChild(link)
              
              setSuccess(`Download started for ${attachment.file_name}`)
              
              // If that doesn't work, fall back to opening in new tab
              setTimeout(() => {
                // Check if download started by trying to detect if the page is still focused
                // This is a heuristic approach
                const startTime = Date.now()
                const checkDownload = () => {
                  if (Date.now() - startTime > 2000) {
                    // If 2 seconds passed and we're still here, download might have failed
                    // Open in new tab as fallback
                    window.open(url, '_blank')
                    setSuccess(`Opened ${attachment.file_name} in new tab. Use your browser's save options to download.`)
                  }
                }
                setTimeout(checkDownload, 100)
              }, 100)
            } catch (e) {
              // Final fallback for mobile
              window.open(url, '_blank')
              setSuccess(`Opened ${attachment.file_name} in new tab. Use your browser's save options to download.`)
            }
          }
        } else {
          // Desktop browser - use standard approach
          const link = document.createElement('a')
          link.href = url
          link.download = attachment.file_name
          link.target = '_blank' // Fallback if download doesn't work
          link.style.display = 'none'
          
          // Add to document, click, then remove
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          
          setSuccess(`Download started for ${attachment.file_name}`)
        }
        
        // Clear success message after 5 seconds
        setTimeout(() => setSuccess(''), 5000)
        
        // Note: Don't call URL.revokeObjectURL() since the URL comes from Supabase, not createObjectURL()
      }
    } catch (err) {
      setError('Download failed: ' + (err as Error).message)
    }
  }

  const handleUpdateDescription = async (attachmentId: string) => {
    try {
      setError('')
      const updated = await fileUploadService.updateAttachment(attachmentId, newDescription)
      setAttachments(prev => 
        prev.map(att => 
          att.id === attachmentId ? { ...att, description: updated.description } : att
        )
      )
      setEditingDescription(null)
      setNewDescription('')
    } catch (err) {
      setError('Update failed: ' + (err as Error).message)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    const files = e.dataTransfer.files
    handleFileSelect(files)
  }

  const getFileIcon = (fileType: string) => {
    if (fileType.startsWith('image/')) {
      return <Image className="w-4 h-4 text-blue-500" />
    }
    if (fileType === 'application/pdf') {
      return <FileText className="w-4 h-4 text-red-500" />
    }
    return <File className="w-4 h-4 text-gray-500" />
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium text-gray-700">
          Attachments ({attachments.length})
        </h4>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-md text-sm">
          <div className="flex items-start gap-2">
            <div className="w-4 h-4 mt-0.5 flex-shrink-0">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <p className="flex-1 break-words">{success}</p>
          </div>
        </div>
      )}

      {/* Enhanced Error Message for Mobile */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-md text-sm">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-medium">Error</p>
              <p className="text-xs mt-1 break-words">{error}</p>
              {error.includes('Download failed') && (
                <p className="text-xs mt-2 text-red-600">
                  <strong>Mobile users:</strong> If download doesn't start automatically, the file will open in a new tab. 
                  You can then save it using your browser's save/share options.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Upload Area */}
    {canEdit && (
    <div className="space-y-3">
        {/* Description Input */}
        <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
            Description (optional)
        </label>
        <input
            type="text"
            value={uploadDescription}
            onChange={(e) => setUploadDescription(e.target.value)}
            placeholder="Enter a description for the file..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
        />
        </div>
        
        {/* Upload Area */}
        <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-4 sm:p-6 text-center cursor-pointer transition-colors touch-manipulation ${
            dragOver 
            ? 'border-blue-400 bg-blue-50' 
            : 'border-gray-300 hover:border-gray-400'
        } ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
        {uploading ? (
            <div className="flex items-center justify-center gap-2 text-gray-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Uploading...</span>
            </div>
        ) : (
            <div className="text-gray-600">
            <Upload className="w-6 h-6 mx-auto mb-2" />
            <p className="text-sm font-medium">
                Drop files here or tap to browse
            </p>
            <p className="text-xs text-gray-500 mt-2">
                JPG, PNG, GIF, WebP, PDF, TIFF (max 10MB)
            </p>
            <p className="text-xs text-gray-400 mt-1 sm:hidden">
                Tip: On mobile, you can select files from your camera, photos, or file manager
            </p>
            </div>
        )}
        </div>
    </div>
    )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf,.tiff"
        onChange={(e) => handleFileSelect(e.target.files)}
        className="hidden"
      />

      {/* Attachments List */}
      {loading ? (
        <div className="flex items-center justify-center py-4 text-gray-500">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading attachments...
        </div>
      ) : attachments.length === 0 ? (
        <div className="text-center py-4 text-gray-500 text-sm">
          No attachments yet
        </div>
      ) : (
        <div className="space-y-2">
          {attachments.map((attachment) => (
            <div key={attachment.id} className="border rounded-lg p-3 sm:p-4 bg-gray-50">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="flex-shrink-0 mt-0.5">
                    {getFileIcon(attachment.file_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                      <span className="text-sm font-medium text-gray-900 break-words">
                        {attachment.file_name}
                      </span>
                      <span className="text-xs text-gray-500">
                        ({formatFileSize(attachment.file_size)})
                      </span>
                    </div>
                    
                    {/* Description */}
                    {editingDescription === attachment.id ? (
                    <div className="mt-2 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      <input
                        type="text"
                        value={newDescription}
                        onChange={(e) => setNewDescription(e.target.value)}
                        placeholder="Add description..."
                        className="w-full sm:flex-1 text-xs px-2 py-1 border rounded"
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                            e.preventDefault()
                            handleUpdateDescription(attachment.id)
                            }
                            if (e.key === 'Escape') {
                            e.preventDefault()
                            setEditingDescription(null)
                            setNewDescription('')
                            }
                        }}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleUpdateDescription(attachment.id)
                          }}
                          className="p-1 text-green-600 hover:text-green-800 touch-manipulation"
                          aria-label="Save description"
                        >
                          <Save className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setEditingDescription(null)
                              setNewDescription('')
                          }}
                          className="p-1 text-gray-500 hover:text-gray-700 touch-manipulation"
                          aria-label="Cancel editing"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    ) : (
                      <>
                        {attachment.description && (
                          <p className="text-xs text-gray-600 mt-1 break-words">
                            {attachment.description}
                          </p>
                        )}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1 text-xs text-gray-500">
                          <span>
                            Uploaded {new Date(attachment.created_at).toLocaleDateString()}
                          </span>
                          {attachment.uploaded_by_user && (
                            <span className="sm:ml-1">by {attachment.uploaded_by_user.name}</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Action Buttons - Mobile Optimized */}
                <div className="flex items-center justify-end sm:justify-start gap-2 sm:gap-1 sm:ml-2">
                <button
                    type="button"
                    onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleDownload(attachment)
                    }}
                    className="flex items-center gap-1 px-2 py-1 sm:p-1 text-xs sm:text-sm text-gray-500 hover:text-blue-600 bg-white sm:bg-transparent border sm:border-0 rounded sm:rounded-none touch-manipulation"
                    title="Download"
                    aria-label={`Download ${attachment.file_name}`}
                >
                    <Download className="w-4 h-4" />
                    <span className="sm:hidden">Download</span>
                </button>
                
                {canEdit && (
                    <>
                    <button
                        type="button"
                        onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setEditingDescription(attachment.id)
                        setNewDescription(attachment.description || '')
                        }}
                        className="flex items-center gap-1 px-2 py-1 sm:p-1 text-xs sm:text-sm text-gray-500 hover:text-blue-600 bg-white sm:bg-transparent border sm:border-0 rounded sm:rounded-none touch-manipulation"
                        title="Edit description"
                        aria-label={`Edit description for ${attachment.file_name}`}
                    >
                        <Edit className="w-4 h-4" />
                        <span className="sm:hidden">Edit</span>
                    </button>
                    
                    <button
                        type="button"
                        onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleDelete(attachment.id)
                        }}
                        className="flex items-center gap-1 px-2 py-1 sm:p-1 text-xs sm:text-sm text-gray-500 hover:text-red-600 bg-white sm:bg-transparent border sm:border-0 rounded sm:rounded-none touch-manipulation"
                        title="Delete"
                        aria-label={`Delete ${attachment.file_name}`}
                    >
                        <Trash2 className="w-4 h-4" />
                        <span className="sm:hidden">Delete</span>
                    </button>
                    </>
                )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}