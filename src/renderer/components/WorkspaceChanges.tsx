import React from 'react';

interface ChangesBadgeProps {
  additions: number;
  deletions: number;
  className?: string;
}

export const ChangesBadge: React.FC<ChangesBadgeProps> = ({ 
  additions, 
  deletions, 
  className = '' 
}) => {
  if (additions === 0 && deletions === 0) {
    return null;
  }

  return (
    <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 ${className}`}>
      {additions > 0 && (
        <span className="text-green-600 dark:text-green-400 mr-1">
          +{additions}
        </span>
      )}
      {deletions > 0 && (
        <span className="text-red-600 dark:text-red-400">
          -{deletions}
        </span>
      )}
    </div>
  );
};