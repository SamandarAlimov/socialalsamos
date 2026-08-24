import { useRef } from 'react';
import { Paperclip, Image, FileText, Film, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFileUpload } from '@/hooks/useFileUpload';
import { toast } from 'sonner';

interface FileUploadButtonProps {
  onUpload: (url: string, type: string, name: string) => void;
  disabled?: boolean;
}

export function FileUploadButton({ onUpload, disabled }: FileUploadButtonProps) {
  const { uploadFile, uploading, getFileType } = useFileUpload();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    const result = await uploadFile(file);
    if (result) {
      onUpload(result.url, getFileType(result.type), result.name);
      toast.success('File uploaded successfully');
    } else {
      toast.error('Failed to upload file');
    }

    // Reset input
    e.target.value = '';
  };

  return (
    <>
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={documentInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.pptx,.ppt"
        className="hidden"
        onChange={handleFileSelect}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled || uploading}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Paperclip className="h-5 w-5" />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => imageInputRef.current?.click()}>
            <Image className="h-4 w-4 mr-2" />
            Image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => videoInputRef.current?.click()}>
            <Film className="h-4 w-4 mr-2" />
            Video
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => documentInputRef.current?.click()}>
            <FileText className="h-4 w-4 mr-2" />
            Document
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
