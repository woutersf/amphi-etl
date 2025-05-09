import { Dialog } from '@jupyterlab/apputils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import {
  BreadCrumbs,
  DirListing,
  FilterFileBrowserModel
} from '@jupyterlab/filebrowser';
import { Widget, PanelLayout } from '@lumino/widgets';

const BROWSE_FILE_CLASS = 'amphi-browseFileDialog';
const BROWSE_FILE_OPEN_CLASS = 'amphi-browseFileDialog-open';

export interface IBrowseFileDialogOptions {
  filter?: (model: any) => boolean;
  multiselect?: boolean;
  includeDir?: boolean;
  acceptFileOnDblClick?: boolean;
  rootPath?: string;
  startPath?: string;
  extensions?: string[];
}

interface IBrowseFileBreadCrumbsOptions extends BreadCrumbs.IOptions {
  rootPath?: string;
}

/**
 * Breadcrumbs widget for browse file dialog body.
 */
class BrowseFileDialogBreadcrumbs extends BreadCrumbs {
  model: any;
  rootPath?: string;

  constructor(options: IBrowseFileBreadCrumbsOptions) {
    super(options);
    this.model = options.model;
    this.rootPath = options.rootPath;
  }

  protected onUpdateRequest(msg: any): void {
    super.onUpdateRequest(msg);
    const contents = this.model.manager.services.contents;
    const localPath = contents.localPath(this.model.path);

    // if 'rootPath' is defined prevent navigating to it's parent/grandparent directories
    if (localPath && this.rootPath && localPath.indexOf(this.rootPath) === 0) {
      const breadcrumbs = document.querySelectorAll(
        '.amphi-browseFileDialog .jp-BreadCrumbs > span[title]'
      );

      breadcrumbs.forEach((crumb: Element): void => {
        if (
          (crumb as HTMLSpanElement).title.indexOf(this.rootPath ?? '') === 0
        ) {
          crumb.className = crumb.className
            .replace('amphi-BreadCrumbs-disabled', '')
            .trim();
        } else if (
          crumb.className.indexOf('amphi-BreadCrumbs-disabled') === -1
        ) {
          crumb.className += ' amphi-BreadCrumbs-disabled';
        }
      });
    }
  }
}

/**
 * Browse dialog modal
 */
class BrowseFileDialog extends Widget
  implements Dialog.IBodyWidget<IBrowseFileDialogOptions> {
  directoryListing: DirListing;
  breadCrumbs: BreadCrumbs;
  dirListingHandleEvent: (event: Event) => void;
  multiselect: boolean;
  includeDir: boolean;
  acceptFileOnDblClick: boolean;
  model: FilterFileBrowserModel;

  constructor(props: any) {
    super(props);

    this.model = new FilterFileBrowserModel({
      manager: props.manager,
      filter: props.filter
    });

    const layout = (this.layout = new PanelLayout());

    this.directoryListing = new DirListing({
      model: this.model
      
    });

    this.acceptFileOnDblClick = props.acceptFileOnDblClick;
    this.multiselect = props.multiselect;
    this.includeDir = props.includeDir;
    this.dirListingHandleEvent = this.directoryListing.handleEvent;
    this.directoryListing.handleEvent = (event: Event): void => {
      this.handleEvent(event);
    };

    this.breadCrumbs = new BrowseFileDialogBreadcrumbs({
      model: this.model,
      rootPath: props.rootPath
    });

    layout.addWidget(this.breadCrumbs);
    layout.addWidget(this.directoryListing);
  }

  static async init(options: any): Promise<BrowseFileDialog> {

    const filterFunction = options.extensions && options.extensions.length > 0
    ? (model: any): boolean => {
        // Always include directories
        if (model.type === 'directory') {
          return true;
        }
        // Check if the file extension matches any of the specified extensions
        const fileExtension = `.${model.name.split('.').pop().toLowerCase()}`;
        return options.extensions.includes(fileExtension);
      }
    : options.filter || (() => true); // Default filter that includes everything

    const browseFileDialog = new BrowseFileDialog({
      manager: options.manager,
      filter: filterFunction,
      multiselect: options.multiselect,
      includeDir: options.includeDir,
      rootPath: options.rootPath,
      startPath: options.startPath,
      acceptFileOnDblClick: options.acceptFileOnDblClick,
    });

    if (options.startPath) {
      if (
        !options.rootPath ||
        options.startPath.indexOf(options.rootPath) === 0
      ) {
        await browseFileDialog.model.cd(options.startPath);
      }
    } else if (options.rootPath) {
      await browseFileDialog.model.cd(options.rootPath);
    }

    return browseFileDialog;
  }

  getValue(): any {
    const selected = [];
    let item = null;

    for (const item of this.directoryListing.selectedItems()) {
      if (this.includeDir || item.type !== 'directory') {
        selected.push(item);
      }
    }

    return selected;
  }

  handleEvent(event: Event): void {
    let modifierKey = false;
    if (event instanceof MouseEvent) {
      modifierKey =
        (event as MouseEvent).shiftKey || (event as MouseEvent).metaKey;
    } else if (event instanceof KeyboardEvent) {
      modifierKey =
        (event as KeyboardEvent).shiftKey || (event as KeyboardEvent).metaKey;
    }

    switch (event.type) {
      case 'keydown':
      case 'keyup':
      case 'mousedown':
      case 'mouseup':
      case 'click':
        if (this.multiselect || !modifierKey) {
          this.dirListingHandleEvent.call(this.directoryListing, event);
        }
        break;
      case 'dblclick': {
        const clickedItem = this.directoryListing.modelForClick(
          event as MouseEvent
        );
        if (clickedItem?.type === 'directory') {
          this.dirListingHandleEvent.call(this.directoryListing, event);
        } else {
          event.preventDefault();
          event.stopPropagation();
          if (this.acceptFileOnDblClick) {
            const okButton = document.querySelector(
              `.${BROWSE_FILE_OPEN_CLASS} .jp-mod-accept`
            );
            if (okButton) {
              (okButton as HTMLButtonElement).click();
            }
          }
        }
        break;
      }
      default:
        this.dirListingHandleEvent.call(this.directoryListing, event);
        break;
    }
  }
}

export const showBrowseFileDialog = async (
  manager: IDocumentManager,
  options: IBrowseFileDialogOptions
): Promise<Dialog.IResult<any>> => {
  const browseFileDialogBody = await BrowseFileDialog.init({
    manager: manager,
    filter: options.filter,
    multiselect: options.multiselect,
    includeDir: options.includeDir,
    rootPath: options.rootPath,
    startPath: options.startPath,
    acceptFileOnDblClick: Object.prototype.hasOwnProperty.call(
      options,
      'acceptFileOnDblClick'
    )
      ? options.acceptFileOnDblClick
      : true
  });

  const dialog = new Dialog({
    title: 'Select a file',
    body: browseFileDialogBody,
    buttons: [Dialog.cancelButton(), Dialog.okButton({ label: 'Select' })]
  });

  dialog.addClass(BROWSE_FILE_CLASS);
  document.body.className += ` ${BROWSE_FILE_OPEN_CLASS}`;

  return dialog.launch().then((result: any) => {
    document.body.className = document.body.className
      .replace(BROWSE_FILE_OPEN_CLASS, '')
      .trim();
    if (options.rootPath && result.button.accept && result.value.length) {
      const relativeToPath = options.rootPath.endsWith('/')
        ? options.rootPath
        : options.rootPath + '/';
      result.value.forEach((val: any) => {
        val.path = val.path.replace(relativeToPath, '');
      });
    }

    return result;
  });
};